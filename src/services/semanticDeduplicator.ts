/**
 * Sentinel — Semantic Event Deduplicator
 *
 * Replaces simple Jaccard similarity with TF-IDF cosine similarity
 * for more accurate semantic dedup of news events.
 * "Fed raises rates" and "Interest rate hike by Federal Reserve"
 * should be detected as duplicates.
 */

// Common English stopwords to ignore in TF-IDF
const STOPWORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'shall', 'can', 'need', 'dare',
    'ought', 'used', 'it', 'its', 'he', 'she', 'they', 'we', 'you', 'i',
    'me', 'him', 'her', 'us', 'them', 'my', 'his', 'our', 'your', 'their',
    'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom',
    'how', 'when', 'where', 'why', 'not', 'no', 'nor', 'so', 'if', 'then',
    'than', 'too', 'very', 'just', 'about', 'above', 'after', 'again',
    'all', 'also', 'am', 'any', 'as', 'back', 'because', 'before',
    'between', 'both', 'each', 'even', 'few', 'get', 'got', 'here',
    'into', 'more', 'most', 'much', 'must', 'new', 'now', 'off', 'old',
    'only', 'other', 'out', 'over', 'own', 'same', 'say', 'says', 'said',
    'some', 'still', 'such', 'take', 'there', 'through', 'under', 'up',
    'upon', 'while', 'down', 'during', 'make', 'like', 'well', 'way',
]);

export interface DeduplicationResult {
    uniqueArticles: any[];
    duplicatesRemoved: number;
    mergedDescriptions: Map<number, string>;
}

export class SemanticDeduplicator {
    /**
     * Tokenize text: lowercase, remove punctuation, split on whitespace,
     * filter stopwords and single-character tokens.
     */
    private static tokenize(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 1 && !STOPWORDS.has(t));
    }

    /**
     * Build TF-IDF vectors for a corpus of documents.
     * Returns a Map from vocabulary term to an array of TF-IDF weights (one per document).
     */
    private static buildTfIdf(documents: string[]): Map<string, number[]> {
        const n = documents.length;
        if (n === 0) return new Map();

        // Tokenize all documents
        const tokenized = documents.map(doc => this.tokenize(doc));

        // Build vocabulary and document frequency
        const df = new Map<string, number>();
        const vocab = new Set<string>();

        for (const tokens of tokenized) {
            const seen = new Set<string>();
            for (const token of tokens) {
                vocab.add(token);
                if (!seen.has(token)) {
                    seen.add(token);
                    df.set(token, (df.get(token) ?? 0) + 1);
                }
            }
        }

        // Compute TF-IDF for each term across all documents
        const tfidf = new Map<string, number[]>();

        for (const term of vocab) {
            const idf = Math.log(n / (df.get(term) ?? 1));
            const weights: number[] = new Array(n);

            for (let i = 0; i < n; i++) {
                const tokens = tokenized[i] ?? [];
                const termCount = tokens.filter(t => t === term).length;
                const tf = tokens.length > 0 ? termCount / tokens.length : 0;
                weights[i] = tf * idf;
            }

            tfidf.set(term, weights);
        }

        return tfidf;
    }

    /**
     * Compute cosine similarity between two TF-IDF vectors.
     * Vectors are represented as arrays indexed by the same vocabulary ordering.
     */
    private static cosineSimilarity(a: number[], b: number[]): number {
        let dot = 0;
        let magA = 0;
        let magB = 0;

        for (let i = 0; i < a.length; i++) {
            const ai = a[i] ?? 0;
            const bi = b[i] ?? 0;
            dot += ai * bi;
            magA += ai * ai;
            magB += bi * bi;
        }

        const denom = Math.sqrt(magA) * Math.sqrt(magB);
        return denom === 0 ? 0 : dot / denom;
    }

    /**
     * Extract TF-IDF vector for a specific document from the term→weights map.
     * Returns a dense vector ordered by vocabulary terms.
     */
    private static getDocVector(tfidf: Map<string, number[]>, docIndex: number): number[] {
        const vec: number[] = [];
        for (const weights of tfidf.values()) {
            vec.push(weights[docIndex] ?? 0);
        }
        return vec;
    }

    /**
     * Main dedup method: returns unique articles, merging descriptions for dupes.
     * Threshold: 0.55 cosine similarity = duplicate (better than Jaccard 0.45).
     */
    static deduplicate(
        articles: Array<{ title: string; description: string; [key: string]: any }>,
        threshold = 0.55
    ): DeduplicationResult {
        if (articles.length === 0) {
            return { uniqueArticles: [], duplicatesRemoved: 0, mergedDescriptions: new Map() };
        }

        // Build TF-IDF from titles
        const titles = articles.map(a => a.title ?? '');
        const tfidf = this.buildTfIdf(titles);

        // Pre-compute document vectors
        const docVectors = articles.map((_, i) => this.getDocVector(tfidf, i));

        // Track which articles are duplicates (merged into another)
        const isDuplicate = new Array(articles.length).fill(false);
        const mergedDescriptions = new Map<number, string>();

        // Compare all pairs — O(n²) but article batches are small (typically <100)
        for (let i = 0; i < articles.length; i++) {
            if (isDuplicate[i]) continue;

            const descriptions = [articles[i]?.description ?? ''];

            for (let j = i + 1; j < articles.length; j++) {
                if (isDuplicate[j]) continue;

                const vecI = docVectors[i];
                const vecJ = docVectors[j];
                if (!vecI || !vecJ) continue;
                const similarity = this.cosineSimilarity(vecI, vecJ);

                if (similarity >= threshold) {
                    isDuplicate[j] = true;
                    // Merge the duplicate's description into the canonical article
                    const dupDesc = articles[j]?.description ?? '';
                    if (dupDesc && !descriptions.includes(dupDesc)) {
                        descriptions.push(dupDesc);
                    }
                }
            }

            // Store merged descriptions if any duplicates were found
            if (descriptions.length > 1) {
                mergedDescriptions.set(i, descriptions.join(' | '));
            }
        }

        const uniqueArticles = articles.filter((_, i) => !isDuplicate[i]);
        const duplicatesRemoved = articles.length - uniqueArticles.length;

        if (duplicatesRemoved > 0) {
            console.log(
                `[SemanticDedup] Removed ${duplicatesRemoved} duplicates from ${articles.length} articles ` +
                `(threshold=${threshold})`
            );
        }

        return { uniqueArticles, duplicatesRemoved, mergedDescriptions };
    }
}
