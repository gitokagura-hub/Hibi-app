import { forwardRef, useEffect, useState } from 'react';
import { isDriveRef, resolveMedia } from '../media';

/**
 * 写真を表示するための <img> の置き換え。
 *
 * 保存された値が "drive:ID"(Drive上の実体)でも "data:image/..."(従来のbase64)でも、
 * 同じように表示できるようにする。base64はそのまま即座に表示し、Drive参照のときだけ
 * 非同期に取得してから差し替える。
 *
 * 使い方は <img> とほぼ同じ:
 *   <MediaImg src={src} alt="" className="..." />
 */
const MediaImg = forwardRef(function MediaImg({ src, alt = '', className = '', onClick, ...rest }, ref) {
  // base64はそのまま使えるので初期値に入れておく(読み込みのちらつきを避ける)。
  const [url, setUrl] = useState(() => (isDriveRef(src) ? null : src));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!isDriveRef(src)) {
      setUrl(src);
      setFailed(false);
      return;
    }
    setUrl(null);
    setFailed(false);
    resolveMedia(src)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch(() => {
        // Drive未連携・トークン切れ・オフラインなど。写真が消えたわけではないので、
        // 「読み込めなかった」ことが分かる表示にとどめる。
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (failed) {
    return (
      <div
        className={`${className} flex items-center justify-center bg-gray-100 text-gray-400 text-[10px] text-center leading-tight`}
        onClick={onClick}
      >
        読み込めません
      </div>
    );
  }

  if (!url) {
    return <div className={`${className} bg-gray-100 animate-pulse`} onClick={onClick} />;
  }

  return <img ref={ref} src={url} alt={alt} className={className} onClick={onClick} {...rest} />;
});

export default MediaImg;
