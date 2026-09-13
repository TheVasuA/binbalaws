// Curated free wallpapers served by Picsum Photos (https://picsum.photos).
// Free to use, no attribution required, stable CDN. We reference specific photo
// IDs so each wallpaper is consistent (not random). Full + thumb URLs are
// generated at the requested sizes.
//
// All IDs below were verified to return HTTP 200.

const FULL = (id) => `https://picsum.photos/id/${id}/1920/1080`;
const THUMB = (id) => `https://picsum.photos/id/${id}/240/135`;

// { picsum id, category label } — 24 curated landscape / nature / calm shots.
const RAW = [
  { id: 10, cat: 'Nature' },
  { id: 11, cat: 'Nature' },
  { id: 15, cat: 'River' },
  { id: 27, cat: 'Nature' },
  { id: 28, cat: 'Forest' },
  { id: 29, cat: 'Woods' },
  { id: 37, cat: 'Flowers' },
  { id: 49, cat: 'Desk' },
  { id: 58, cat: 'Forest' },
  { id: 63, cat: 'Sunset' },
  { id: 76, cat: 'Ocean' },
  { id: 82, cat: 'Field' },
  { id: 93, cat: 'Coast' },
  { id: 110, cat: 'Mountain' },
  { id: 133, cat: 'Leaf' },
  { id: 142, cat: 'Valley' },
  { id: 152, cat: 'Calm' },
  { id: 164, cat: 'Night' },
  { id: 177, cat: 'Forest' },
  { id: 183, cat: 'Snow' },
  { id: 195, cat: 'City' },
  { id: 206, cat: 'Calm' },
  { id: 214, cat: 'Peaks' },
  { id: 225, cat: 'Harbor' },
];

export const WALLPAPERS = RAW.map((w) => ({
  id: `pic-${w.id}`,
  cat: w.cat,
  url: FULL(w.id),
  thumb: THUMB(w.id),
}));

export const WALLPAPER_NONE = 'none';
