/** Diện mạo nhân vật: dùng chung cho bản 3D và bản 2D pixel art. Hàm thuần, không dính tới hình vẽ. */

export interface Look {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  style: 0 | 1 | 2;
  crown: boolean;
  tie: boolean;
  glasses: boolean;
}

const SKIN = ['#f6d3b3', '#e8b58f', '#c98e63', '#8d5a3b', '#fbe0c8'];
const HAIR = ['#2b1d14', '#5a3a1e', '#161616', '#a86b2c', '#b9bec7', '#7b3f1d'];

export function lookFor(name: string, shirt: string, opts: { crown: boolean; director: boolean }): Look {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return {
    skin: SKIN[h % SKIN.length],
    hair: HAIR[(h >> 3) % HAIR.length],
    shirt: opts.director ? '#2f3650' : shirt,
    pants: opts.director ? '#262b3f' : '#3b4a68',
    style: ((h >> 6) % 3) as 0 | 1 | 2,
    crown: opts.crown,
    tie: opts.director,
    glasses: (h >> 9) % 4 === 0,
  };
}

