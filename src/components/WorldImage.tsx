import { useState, type ImgHTMLAttributes } from 'react';

type WorldImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
  fallbackSrc: string;
};

function ImageWithFallback({ src, fallbackSrc, srcSet, onError, ...props }: WorldImageProps) {
  const [state, setState] = useState<'original' | 'fallback' | 'hidden'>(src ? 'original' : fallbackSrc ? 'fallback' : 'hidden');
  if (state === 'hidden') return null;

  return <img {...props} src={state === 'original' ? src : fallbackSrc} srcSet={state === 'original' ? srcSet : undefined} onError={event => {
    onError?.(event);
    setState(state === 'original' && fallbackSrc && (src !== fallbackSrc || srcSet) ? 'fallback' : 'hidden');
  }} />;
}

export default function WorldImage(props: WorldImageProps) {
  return <ImageWithFallback key={JSON.stringify([props.src, props.fallbackSrc])} {...props} />;
}
