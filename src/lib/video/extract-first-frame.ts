/**
 * 从视频文件中提取第 0 帧为图片 Blob（用于短视频封面等）
 * 在浏览器端使用 video + canvas 实现，仅支持本地 File（不支持跨域 URL）
 */

const VIDEO_SEEK_TO = 0

/**
 * 从视频 File 提取第一帧图像
 * @param file 视频文件（如 mp4、webm）
 * @returns JPEG Blob，失败时抛出或返回 null
 */
export function extractVideoFirstFrame(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'

    const objectUrl = URL.createObjectURL(file)
    video.src = objectUrl

    const cleanup = () => {
      video.removeEventListener('loadeddata', onLoaded)
      video.removeEventListener('error', onError)
      URL.revokeObjectURL(objectUrl)
      video.src = ''
    }

    const onError = (e: Event) => {
      cleanup()
      reject(new Error('视频加载失败，无法提取封面'))
    }

    const onLoaded = () => {
      video.removeEventListener('error', onError)
      try {
        video.currentTime = VIDEO_SEEK_TO
      } catch {
        cleanup()
        reject(new Error('视频无法定位到第一帧'))
        return
      }
    }

    video.addEventListener('loadeddata', onLoaded, { once: true })
    video.addEventListener('error', onError, { once: true })

    video.addEventListener(
      'seeked',
      () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          if (canvas.width === 0 || canvas.height === 0) {
            cleanup()
            reject(new Error('视频尺寸无效'))
            return
          }
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            cleanup()
            reject(new Error('无法创建画布'))
            return
          }
          ctx.drawImage(video, 0, 0)
          canvas.toBlob(
            (blob) => {
              cleanup()
              if (blob) resolve(blob)
              else reject(new Error('导出封面图失败'))
            },
            'image/jpeg',
            0.85
          )
        } catch (e) {
          cleanup()
          reject(e instanceof Error ? e : new Error('提取封面失败'))
        }
      },
      { once: true }
    )

    video.load()
  })
}
