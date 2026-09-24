'use client';

import { deleteRowAction } from '@/lib/actions';

export function DeleteButton({
  table,
  pk,
  warning,
}: {
  table: string;
  pk: string;
  warning?: string;
}) {
  return (
    <form
      action={deleteRowAction}
      onSubmit={(event) => {
        const message = warning
          ? `确认删除这条记录？${warning}`
          : '确认删除这条记录？此操作不可恢复。';
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="pk" value={pk} />
      <button className="btn btn-danger" type="submit">
        删除
      </button>
    </form>
  );
}
