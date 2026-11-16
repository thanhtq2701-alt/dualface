/* DualFace - webcam: mở luồng video, cắt mặt vùng giữa khung thành ảnh tròn */
(function (root) {
  'use strict';
  const DF = root.DF || (root.DF = {});
  let stream = null;

  DF.camera = {
    supported() { return !!(root.navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia); },
    async open(videoEl) {
      if (!DF.camera.supported()) throw new Error('Trình duyệt không hỗ trợ camera');
      if (stream) DF.camera.stop();
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false
      });
      videoEl.srcObject = stream;
      await new Promise(res => {
        if (videoEl.readyState >= 2) return res();
        videoEl.onloadedmetadata = () => res();
      });
      try { await videoEl.play(); } catch (e) { /* autoplay bị chặn thì vẫn hiển thị được khung */ }
      return stream;
    },
    stop() {
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    },
    get active() { return !!stream; },
    /**
     * Cắt vùng vuông ở giữa video (tỉ lệ `frac` chiều cao), lật gương, trả về dataURL PNG size x size.
     */
    capture(videoEl, size = 128, frac = 0.6) {
      const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
      if (!vw || !vh) return null;
      const s = Math.min(vw, vh) * frac;
      const sx = (vw - s) / 2, sy = (vh - s) / 2;
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const g = c.getContext('2d');
      g.save();
      g.translate(size, 0); g.scale(-1, 1);
      g.drawImage(videoEl, sx, sy, s, s, 0, 0, size, size);
      g.restore();
      return c.toDataURL('image/png');
    },
    /** Tải dataURL thành Image (promise). */
    load(dataUrl) {
      return new Promise((res, rej) => {
        if (!dataUrl) return res(null);
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => rej(new Error('Không tải được ảnh'));
        img.src = dataUrl;
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
