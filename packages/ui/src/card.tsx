import type { HTMLAttributes } from 'react';
export type CardProps = HTMLAttributes<HTMLElement> & { tone?: 'default' | 'soft' };
export function Card({ tone = 'default', className = '', ...props }: CardProps) {
  return <section className={`fisher-card fisher-card--${tone} ${className}`.trim()} {...props} />;
}
