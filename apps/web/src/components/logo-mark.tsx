import { useEffect, useState } from "react";

export function LogoMark({
  logoUrl,
  fallbackText,
  className = "mark",
}: {
  logoUrl?: string;
  fallbackText: string;
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const resolvedLogoUrl = logoUrl?.trim();

  useEffect(() => {
    setImageFailed(false);
  }, [resolvedLogoUrl]);

  if (resolvedLogoUrl && !imageFailed) {
    return (
      <div className={`${className} mark--image`}>
        <img
          src={resolvedLogoUrl}
          alt=""
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  return <div className={className}>{fallbackText}</div>;
}
