export class TableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TableError';
  }
}

export function publicError(error: unknown): string {
  if (error instanceof TableError) return error.message;
  if (error instanceof Error) {
    const code = 'code' in error ? String((error as { code?: string }).code ?? '') : '';
    if (
      code === 'ER_DUP_ENTRY' ||
      error.message.includes('UNIQUE constraint failed') ||
      error.message.includes('Duplicate entry')
    ) {
      return '存在重复的唯一字段，请检查编码或名称';
    }
    if (
      code === 'ER_ROW_IS_REFERENCED_2' ||
      code === 'ER_NO_REFERENCED_ROW_2' ||
      error.message.includes('FOREIGN KEY constraint failed') ||
      error.message.includes('foreign key constraint fails')
    ) {
      return '该记录仍被其他数据引用，无法保存或删除';
    }
    if (
      code === 'ER_BAD_NULL_ERROR' ||
      error.message.includes('NOT NULL constraint failed') ||
      error.message.includes("doesn't have a default value")
    ) {
      return '有必填字段未填写';
    }
    console.error(error);
  }
  return '操作失败';
}
