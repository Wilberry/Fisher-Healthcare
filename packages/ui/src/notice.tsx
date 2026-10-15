import type { HTMLAttributes, ReactNode } from 'react';
export type NoticeProps = HTMLAttributes<HTMLDivElement> & {
  tone?: 'info' | 'warning';
  title: string;
  children: ReactNode;
};
export function Notice({ title, tone = 'info', children, className = '', ...props }: NoticeProps) {
  return <div role="status" className={`fisher-notice fisher-notice--${tone} ${className}`.trim()} {...props}>
    <strong>{title}</strong><div>{children}</div>
  </div>;
}
