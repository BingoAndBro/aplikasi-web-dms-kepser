import * as React from 'react'

import { cn } from '#/lib/utils'

export function UserAvatar({
  alt,
  className,
  imageClassName,
  initials,
  src,
}: {
  alt: string
  className?: string
  imageClassName?: string
  initials: string
  src?: string | null
}) {
  const [imageFailed, setImageFailed] = React.useState(false)

  React.useEffect(() => {
    setImageFailed(false)
  }, [src])

  const showImage = Boolean(src) && !imageFailed

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-white',
        className,
      )}
    >
      {showImage ? (
        <img
          src={src ?? undefined}
          alt={alt}
          className={cn('size-full object-cover', imageClassName)}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="select-none font-extrabold tracking-wide text-white">
          {initials}
        </span>
      )}
    </div>
  )
}
