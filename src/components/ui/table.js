import { cn } from '@/lib/cn';

export function Table({ className, children }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  );
}

export function THead({ children, sticky = false }) {
  return (
    <thead className={cn(sticky && 'sticky top-0 z-10 bg-surface')}>
      <tr className="border-b border-line">{children}</tr>
    </thead>
  );
}

export function Th({ align = 'left', className, children }) {
  return (
    <th
      scope="col"
      className={cn(
        'h-9 whitespace-nowrap px-3 text-[11px] font-medium uppercase tracking-wide text-fg-subtle first:pl-4 last:pr-4',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Tr({ className, children, ...props }) {
  return (
    <tr className={cn('border-b border-line last:border-0 hover:bg-surface-2', className)} {...props}>
      {children}
    </tr>
  );
}

export function Td({ align = 'left', className, children, ...props }) {
  return (
    <td
      className={cn(
        'whitespace-nowrap px-3 py-2.5 align-middle first:pl-4 last:pr-4',
        align === 'right' ? 'num text-right' : align === 'center' ? 'text-center' : 'text-left',
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}
