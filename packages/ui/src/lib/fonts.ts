import geistLatin from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2";

// Bun's CSS bundler inlines every url() asset as a data URL, which put ~40 kB of
// font into first-view CSS. Importing the file from JS emits it as a hashed asset
// instead; FontFace registers it with the same descriptors as the CSS would.
const LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

export function loadFonts(fonts: FontFaceSet = document.fonts) {
  // Family name matches the theme's `--font-sans: Geist`.
  const geist = new FontFace("Geist", `url(${geistLatin}) format("woff2-variations")`, {
    weight: "100 900",
    display: "swap",
    unicodeRange: LATIN,
  });

  fonts.add(geist);

  return geist.load();
}
