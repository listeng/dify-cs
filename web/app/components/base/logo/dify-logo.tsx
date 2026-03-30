'use client'
import type { FC } from 'react'
import useTheme from '@/hooks/use-theme'
import { cn } from '@/utils/classnames'
import { basePath } from '@/utils/var'

export type LogoStyle = 'default' | 'monochromeWhite'

export const logoPathMap: Record<LogoStyle, string> = {
  default: '/logo/logo.svg',
  monochromeWhite: '/logo/logo-monochrome-white.svg',
}

export const logoDnrPathMap: Record<LogoStyle, string> = {
  default: '/logo/logodnr.svg',
  monochromeWhite: '/logo/logodnr.svg',
}

export type LogoSize = 'large' | 'medium' | 'small'

export const logoSizeMap: Record<LogoSize, string> = {
  large: 'w-16 h-7',
  medium: 'w-12 h-[22px]',
  small: 'w-9 h-4',
}

export const logoDnrSizeMap: Record<LogoSize, string> = {
  large: 'w-16 h-7',
  medium: 'w-12 h-[24px]',
  small: 'w-9 h-4',
}

type DifyLogoProps = {
  style?: LogoStyle
  size?: LogoSize
  className?: string
}

const DifyLogo: FC<DifyLogoProps> = ({
  style = 'default',
  size = 'medium',
  className,
}) => {
  const { theme } = useTheme()
  const themedStyle = (theme === 'dark' && style === 'default') ? 'monochromeWhite' : style

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <img
        src={`${basePath}${logoPathMap[themedStyle]}`}
        className={cn('block object-contain', logoSizeMap[size])}
        alt="Dify logo"
      />
      <span className="text-sm text-gray-400">/</span>
      <img
        src={`${basePath}${logoDnrPathMap[themedStyle]}`}
        className={cn('block object-contain', logoDnrSizeMap[size])}
        alt="GXDNR logo"
      />
    </div>
  )
}

export default DifyLogo
