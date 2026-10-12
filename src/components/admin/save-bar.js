'use client';

import { Button } from '@/components/ui';

/** Sticky footer shown while a form has unsaved changes. */
export function SaveBar({ visible, count, saving, disabled, onSave, onDiscard, message }) {
  if (!visible) return null;
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-line bg-bg/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-fg-muted">
          {message || `${count} unsaved change${count === 1 ? '' : 's'}`}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>Discard</Button>
          <Button variant="primary" size="sm" onClick={onSave} loading={saving} disabled={disabled}>Save changes</Button>
        </div>
      </div>
    </div>
  );
}
