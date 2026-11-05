'use client';

import { useActionState } from 'react';
import { ImageUrlField } from '@/components/ImageUrlField';
import { saveRowAction, type FormState } from '@/lib/actions';
import type { FieldMeta } from '@/lib/tables';

function FieldControl({ field }: { field: FieldMeta }) {
  if (field.readonly) {
    if (field.options) {
      const label = field.options.find((option) => option.value === field.value)?.label;
      return <p className="readonly">{label || field.value || '—'}</p>;
    }
    return <p className="readonly">{field.value || '—'}</p>;
  }
  if (field.imageUpload) {
    return (
      <ImageUrlField
        name={field.name}
        value={field.value}
        required={field.required}
        maxLength={field.maxLength}
        folder={field.imageFolder}
      />
    );
  }
  if (field.options) {
    return (
      <select name={field.name} defaultValue={field.value} required={field.required}>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  switch (field.kind) {
    case 'boolean':
      return (
        <select name={field.name} defaultValue={field.value === '0' ? '0' : '1'}>
          <option value="1">是</option>
          <option value="0">否</option>
        </select>
      );
    case 'integer':
    case 'number':
      return (
        <input
          name={field.name}
          inputMode="decimal"
          defaultValue={field.value}
          required={field.required}
        />
      );
    case 'text':
    case 'datetime':
      if (field.long || field.json) {
        return (
          <textarea
            name={field.name}
            defaultValue={field.value}
            rows={field.json ? 8 : 4}
            required={field.required}
            maxLength={field.maxLength ?? undefined}
          />
        );
      }
      return (
        <input
          name={field.name}
          defaultValue={field.value}
          required={field.required}
          maxLength={field.maxLength ?? undefined}
        />
      );
    default: {
      const exhaustive: never = field.kind;
      return exhaustive;
    }
  }
}

export function RowForm({
  table,
  pk,
  fields,
  canSave = true,
}: {
  table: string;
  pk: string | null;
  fields: FieldMeta[];
  canSave?: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveRowAction, null);
  return (
    <form action={action} className="card">
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="pk" value={pk ?? ''} />
      {state?.error ? <p className="alert alert-error">{state.error}</p> : null}
      <div className="form-grid">
        {fields.map((field) => (
          <label
            key={field.name}
            className={field.long || field.json || field.imageUpload ? 'field field-wide' : 'field'}
          >
            <span>{field.label}</span>
            <FieldControl field={field} />
            {field.hint ? <p className="hint">{field.hint}</p> : null}
          </label>
        ))}
      </div>
      {canSave ? (
        <div className="row-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? '保存中…' : '保存'}
          </button>
        </div>
      ) : null}
    </form>
  );
}
