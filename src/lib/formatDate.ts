export function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'long',
    ...(options ?? {}),
  }).format(new Date(value));
}
