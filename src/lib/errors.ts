export class TableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TableError';
  }
}

export function publicError(error: unknown): string {
  if (error instanceof TableError) return error.message;
  if (error instanceof Error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return '存在重复的唯一字段，请检查编码或名称';
    }
    if (error.message.includes('FOREIGN KEY constraint failed')) {
      return '该记录仍被其他数据引用，无法保存或删除';
    }
    if (error.message.includes('NOT NULL constraint failed')) {
      return '有必填字段未填写';
    }
    console.error(error);
  }
  return '操作失败';
}
