export async function grabScreenStill(): Promise<string> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("unsupported");
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    if (video.videoWidth === 0) {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 240);
      });
    }
    return frameFromVideo(video);
  } finally {
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }
}

export function frameFromVideo(video: HTMLVideoElement): string {
  const sourceWidth = video.videoWidth || 640;
  const sourceHeight = video.videoHeight || 480;
  const width = Math.min(sourceWidth, 960);
  const height = Math.max(1, Math.round(width * (sourceHeight / sourceWidth)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("canvas");
  }
  context.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.62);
}
