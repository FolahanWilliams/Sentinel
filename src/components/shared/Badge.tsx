/**
 * Badge — Reusable pill/badge component for labels, statuses, and tags.
 */

interface BadgeProps {
    label: string;
    color?: string;
    variant?: 'filled' | 'outline' | 'subtle';
    size?: 'sm' | 'md';
    icon?: React.ReactNode;
}

export function Badge({ label, color = '#6B7280', variant = 'subtle', size = 'sm', icon }: BadgeProps) {
    const styles: React.CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: size === 'sm' ? '2px 8px' : '4px 12px',
        borderRadius: '9999px',
        fontSize: size === 'sm' ? '0.7rem' : '0.8rem',
        fontWeight: 600,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
    };

    if (variant === 'filled') {
        styles.backgroundColor = color;
        styles.color = '#fff';
    } else if (variant === 'outline') {
        styles.border = `1px solid ${color}`;
        styles.color = color;
        styles.backgroundColor = 'transparent';
    } else {
        styles.backgroundColor = `${color}22`;
        styles.color = color;
    }

    return (
        <span style={styles}>
            {icon}
            {label}
        </span>
    );
}
