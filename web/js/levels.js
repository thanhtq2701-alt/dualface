/* DualFace - danh sách màn chơi. Mỗi màn = cấu hình cho DF.Flappy.
 * Mở khoá: màn kế tiếp mở khi có người đạt `goal` ống ở màn hiện tại (hoặc bật "mở tất cả" trong cài đặt).
 * items: { chance, kinds } – xác suất xuất hiện vật phẩm giữa hai ống (khiên 🛡️, lông vũ 🪶, thu nhỏ 🍄, phình to đối thủ 🎈).
 */
(function (root) {
  'use strict';
  const DF = root.DF || (root.DF = {});

  const ITEMS = { chance: 0.28 };

  DF.LEVELS = [
    {
      id: 'meadow', order: 1, name: 'Đồng cỏ', icon: '🌱', difficulty: 1,
      tagline: 'Màn làm quen. Ống đứng yên, khe rộng.',
      tips: 'Nhấn nhẹ, đều tay. Đừng giữ phím. Màn này chưa có vật phẩm.',
      gravity: 0.3, jump: -6, speed: 2.3, speedRamp: 0.02, maxSpeed: 3.2,
      gap: 180, gapMin: 150, gapShrink: 1.5, spawnDist: 240, goal: 10,
      theme: { sky: ['#6fd3e6', '#c9f0f7'], pipe: '#7bc043', pipeDark: '#4e8a2a', ground: '#d9c87a', groundTop: '#8bc34a', backdrop: 'hills', pipeStyle: 'pipe' }
    },
    {
      id: 'sunset', order: 2, name: 'Hoàng hôn', icon: '🌇', difficulty: 2,
      tagline: 'Nhanh hơn, khe hẹp dần. Bắt đầu có vật phẩm.',
      tips: 'Vòng tròn vàng là vật phẩm: 🛡️ đỡ 1 lần, 🪶 bay nhẹ, 🍄 thu nhỏ, 🎈 phình to đối thủ.',
      gravity: 0.34, jump: -6.3, speed: 2.8, speedRamp: 0.05, maxSpeed: 4.2,
      gap: 165, gapMin: 125, gapShrink: 2.5, spawnDist: 225, goal: 12, items: ITEMS,
      theme: { sky: ['#ff8c42', '#ffd166'], pipe: '#d9534f', pipeDark: '#9c2f2c', ground: '#c98b5a', groundTop: '#e3a76d', backdrop: 'sunset', pipeStyle: 'pipe' }
    },
    {
      id: 'city', order: 3, name: 'Thành phố đêm', icon: '🌃', difficulty: 3,
      tagline: 'Các toà nhà trượt lên xuống. Canh nhịp!',
      tips: 'Khe di chuyển theo hình sin, nhìn hướng đang trượt trước khi lao vào.',
      gravity: 0.32, jump: -6.2, speed: 2.7, speedRamp: 0.03, maxSpeed: 3.8,
      gap: 175, gapMin: 140, gapShrink: 2, spawnDist: 250, goal: 12, items: ITEMS,
      mechanics: { movingPipes: { amp: 40, freq: 0.035 } },
      theme: { sky: ['#0f1535', '#2b2f6b'], pipe: '#3a3f73', pipeDark: '#23264a', ground: '#2d2d3a', groundTop: '#4a4a63', backdrop: 'city', pipeStyle: 'building' }
    },
    {
      id: 'cave', order: 4, name: 'Hang động', icon: '🪨', difficulty: 3,
      tagline: 'Nhũ đá sát nhau, có dơi bay qua khe.',
      tips: 'Dơi bay lượn sóng. Đợi nó đi qua rồi mới chui.',
      gravity: 0.33, jump: -6.1, speed: 2.5, speedRamp: 0.03, maxSpeed: 3.6,
      gap: 170, gapMin: 135, gapShrink: 2, spawnDist: 200, goal: 12, items: ITEMS,
      mechanics: { hazards: { chance: 0.45, kind: 'bat' } },
      theme: { sky: ['#2a1f1a', '#4a3528'], pipe: '#7a6553', pipeDark: '#3f3129', ground: '#3b2d24', groundTop: '#5c4636', backdrop: 'cave', pipeStyle: 'rock' }
    },
    {
      id: 'wind', order: 5, name: 'Gió lốc', icon: '🌬️', difficulty: 4,
      tagline: 'Gió thổi lên/xuống bất chợt, có báo trước.',
      tips: 'Thấy mũi tên vàng nhấp nháy là gió sắp tới: ⬆ thì bớt nhảy, ⬇ thì nhảy dày hơn.',
      gravity: 0.32, jump: -6.2, speed: 2.7, speedRamp: 0.03, maxSpeed: 3.9,
      gap: 180, gapMin: 145, gapShrink: 2, spawnDist: 240, goal: 12, items: ITEMS,
      mechanics: { wind: { strength: 0.16, period: 300, duration: 110 } },
      theme: { sky: ['#8fb8de', '#dfeeff'], pipe: '#5f9ea0', pipeDark: '#3b6d6e', ground: '#a9b7a0', groundTop: '#c7d6bd', backdrop: 'hills', pipeStyle: 'pipe' }
    },
    {
      id: 'ice', order: 6, name: 'Băng giá', icon: '🧊', difficulty: 4,
      tagline: 'Nhũ băng treo dưới ống, rơi khi bạn tới gần.',
      tips: 'Nhũ băng có dấu ! nhấp nháy. Đừng bay sát đáy ống trên; để nó rơi xuống rồi mới chui.',
      gravity: 0.31, jump: -6.1, speed: 2.6, speedRamp: 0.03, maxSpeed: 3.7,
      gap: 180, gapMin: 145, gapShrink: 2, spawnDist: 245, goal: 12, items: ITEMS,
      mechanics: { icicles: { chance: 0.7 } },
      theme: { sky: ['#9fd8ef', '#eaf8ff'], pipe: '#bfe8f7', pipeDark: '#6fb5d6', ground: '#dfe9ee', groundTop: '#ffffff', backdrop: 'hills', pipeStyle: 'rock' }
    },
    {
      id: 'moon', order: 7, name: 'Mặt trăng', icon: '🌙', difficulty: 4,
      tagline: 'Trọng lực thấp, bay nhanh, thiên thạch trôi.',
      tips: 'Rơi chậm nhưng nhảy cũng bay xa. Nhấn thưa thôi.',
      gravity: 0.18, jump: -4.6, maxVy: 6, speed: 3.3, speedRamp: 0.03, maxSpeed: 4.4,
      gap: 165, gapMin: 135, gapShrink: 1.5, spawnDist: 230, goal: 12, items: ITEMS,
      mechanics: { hazards: { chance: 0.5, kind: 'rock' } },
      theme: { sky: ['#05060f', '#1b1f3a'], pipe: '#9aa5b1', pipeDark: '#5d6773', ground: '#8a8f99', groundTop: '#b3b8c2', backdrop: 'stars', pipeStyle: 'rock' }
    },
    {
      id: 'volcano', order: 8, name: 'Núi lửa', icon: '🌋', difficulty: 5,
      tagline: 'Cầu lửa phun từ mặt đất, có dấu báo trước.',
      tips: 'Tam giác cam nhấp nháy dưới đất = cầu lửa sắp phun ngay cột đó. Né sang khe khác hoặc bay cao.',
      gravity: 0.33, jump: -6.2, speed: 2.8, speedRamp: 0.04, maxSpeed: 4.1,
      gap: 175, gapMin: 140, gapShrink: 2, spawnDist: 240, goal: 15, items: ITEMS,
      mechanics: { fireballs: { period: 150, warn: 55 } },
      theme: { sky: ['#2b0a0a', '#8a2a1a'], pipe: '#4a2c2a', pipeDark: '#2a1716', ground: '#5a1e12', groundTop: '#ff6b35', backdrop: 'cave', pipeStyle: 'rock' }
    },
    {
      id: 'storm', order: 9, name: 'Bão tố', icon: '⛈️', difficulty: 5,
      tagline: 'Sét chớp che mất ống trong tích tắc. Gió mạnh.',
      tips: 'Ghi nhớ vị trí khe trước khi chớp. Nghe tiếng sét là chớp sắp xong.',
      gravity: 0.33, jump: -6.2, speed: 2.9, speedRamp: 0.04, maxSpeed: 4.2,
      gap: 170, gapMin: 135, gapShrink: 2, spawnDist: 235, goal: 15, items: ITEMS,
      mechanics: { wind: { strength: 0.2, period: 260, duration: 90 }, lightning: { chance: 0.006 } },
      theme: { sky: ['#1c1f2b', '#3a4058'], pipe: '#4f5b66', pipeDark: '#2f363d', ground: '#3d4350', groundTop: '#5a6273', backdrop: 'storm', pipeStyle: 'pipe' }
    },
    {
      id: 'chaos', order: 10, name: 'Hỗn loạn', icon: '🌀', difficulty: 5,
      tagline: 'Cứ 5 ống đảo trọng lực một lần. Ống còn trượt.',
      tips: 'Khi đảo ngược, phím nhảy sẽ đẩy bạn XUỐNG. Trần cũng gây chết.',
      gravity: 0.3, jump: -5.8, speed: 2.8, speedRamp: 0.04, maxSpeed: 4.3,
      gap: 185, gapMin: 150, gapShrink: 1.5, spawnDist: 240, goal: 15, items: ITEMS,
      mechanics: { flipEvery: 5, movingPipes: { amp: 25, freq: 0.03 } },
      theme: { sky: ['#3a0ca3', '#f72585'], pipe: '#4cc9f0', pipeDark: '#2a7fa6', ground: '#240046', groundTop: '#5a189a', backdrop: 'stars', pipeStyle: 'pipe' }
    }
  ];

  DF.levelById = id => DF.LEVELS.find(l => l.id === id);
  DF.nextLevel = id => { const l = DF.levelById(id); return l ? DF.LEVELS.find(x => x.order === l.order + 1) || null : null; };

  if (typeof module !== 'undefined' && module.exports) module.exports = DF.LEVELS;
})(typeof window !== 'undefined' ? window : globalThis);
