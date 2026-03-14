const DEFAULT_DATA_URL_CONTENT_TYPE = "text/plain;charset=US-ASCII";

export function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([\s\S]*?),(.*)$/);
  if (!match) {
    throw new Error("Invalid data URL payload");
  }

  const [, rawMetadata, data] = match;
  const metadata = rawMetadata.trim();
  const isBase64 = /;base64$/i.test(metadata);
  const contentType = (isBase64 ? metadata.replace(/;base64$/i, "") : metadata)
    || DEFAULT_DATA_URL_CONTENT_TYPE;

  return {
    contentType,
    data,
    isBase64,
  };
}
