/**
 * CTASection — closing call to action, shared by both public surfaces.
 */

import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useGoogleSignIn } from '@/hooks/useGoogleSignIn';

export function CTASection({
    title = 'See the engine think.',
    body = 'Watch a signal move through all five agents, get red-teamed, and land in the audit trail — in real time.',
    showBuildLink = true,
}: {
    title?: string;
    body?: string;
    showBuildLink?: boolean;
}) {
    const { signIn, loading, error } = useGoogleSignIn();

    return (
        <section className="relative overflow-hidden">
            <div className="absolute inset-0 bg-grid-pattern opacity-30" />
            <div className="absolute left-1/2 -translate-x-1/2 -bottom-24 w-[36rem] h-[36rem] bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative max-w-3xl mx-auto px-6 py-24 sm:py-32 text-center">
                <motion.h2
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    className="text-3xl sm:text-4xl font-bold font-display tracking-tight text-sentinel-50 mb-4"
                >
                    {title}
                </motion.h2>
                <p className="text-sentinel-400 mb-8 max-w-lg mx-auto leading-relaxed">{body}</p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                        onClick={signIn}
                        disabled={loading}
                        className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-base font-medium transition-colors border-none cursor-pointer disabled:opacity-50"
                    >
                        {loading ? 'Redirecting…' : 'Get started'} <ArrowRight className="w-4 h-4" />
                    </button>
                    {showBuildLink && (
                        <Link
                            to="/about"
                            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white/5 hover:bg-white/10 text-sentinel-100 rounded-xl text-base font-medium transition-colors ring-1 ring-white/10 no-underline"
                        >
                            How it’s built
                        </Link>
                    )}
                </div>
                {error && <p className="text-xs mt-3 text-red-400">{error}</p>}
            </div>
        </section>
    );
}
