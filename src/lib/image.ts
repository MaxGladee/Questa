/**
 * Подготовка снимка перед отправкой.
 *
 * Снимок с телефона весит несколько мегабайт, а для хранения и для проверки
 * моделью такой размер не нужен: уменьшенная сторона в 1280 точек сохраняет
 * всё, что видно на фотографии, и при этом загружается за секунду даже на
 * слабой связи.
 */
export async function shrinkImage (
  file: File, maxSide = 1280, quality = 0.82,
): Promise<File> {
  const bitmap = await createImageBitmap(file)

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) return file

  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality))

  if (!blob) return file
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
}

/** Содержимое файла строкой — в таком виде снимок уходит на проверку. */
export async function toBase64 (file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  let binary = ''
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte)
  return btoa(binary)
}
