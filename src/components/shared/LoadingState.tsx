/**
 * LoadingState — Centered spinner with optional message.
 */

interface LoadingStateProps {
    message?: string;
    size?: 'sm' | 'md' | 'lg';
}

export function LoadingState({ message, size = 'md' }: LoadingStateProps) {
    const dim = size === 'sm' ? 'w-5 h-5' : size === 'md' ? 'w-8 h-8' : 'w-12 h-12';

    return (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className={`${dim} border-2 border-sentinel-600 border-t-sentinel-300 rounded-full animate-spin`} />
            {message && (
                <p className="text-sm text-sentinel-400">{message}</p>
            )}
        </div>
    );
}
