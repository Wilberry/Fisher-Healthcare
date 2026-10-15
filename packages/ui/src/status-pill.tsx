import type { HTMLAttributes } from 'react';
export type StatusPillProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'positive' | 'caution';
};
export function StatusPill({ tone = 'neutral', className = '', ...props }: StatusPillProps) {
  return <span className={`fisher-status fisher-status--${tone} ${className}`.trim()} {...props} />;
}
