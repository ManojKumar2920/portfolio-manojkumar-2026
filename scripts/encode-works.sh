#!/bin/sh
# Web encodes of the work reels (assets-src/works → public/media/works): 1280 wide, 30 fps, H.264, no audio,
# faststart; a poster frame for each; logos and stills resized.
set -e
SRC=assets-src/works
OUT=public/media/works
mkdir -p "$OUT"
enc() { # src name posterSec
  ffmpeg -v error -y -i "$1" -an -vf "fps=30,scale=1280:-2:flags=lanczos" -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 27 -maxrate 2.4M -bufsize 4.8M -movflags +faststart "$OUT/$2.mp4"
  ffmpeg -v error -y -ss "$3" -i "$1" -frames:v 1 -vf "scale=1280:-2:flags=lanczos" -q:v 4 "$OUT/$2.jpg"
}
enc "$SRC/3d/1_blues.mov" blue-blues 2
enc "$SRC/3d/2_cfoco.mov" cfoco 3
enc "$SRC/3d/3_agasti.mov" agasti 1
enc "$SRC/3d/4_regen.mov" regen-power 1
enc "$SRC/fullstack/360electronics.mov" 360-electronics 1
enc "$SRC/fullstack/crux-launch-16x9.mp4" crux 9
ffmpeg -v error -y -i "$SRC/fullstack/panchayat-s4-campaign.jpg" -vf "scale=1600:-2:flags=lanczos" -q:v 4 "$OUT/panchayat.jpg"
# MoveIt's mark sits in a thin strip of a huge square canvas: crop to the wordmark (+4% margin), then scale
ffmpeg -v error -y -i "$SRC/fullstack/Moveit_White.png" -vf "crop=iw*0.857:ih*0.144:iw*0.064:ih*0.425,scale=1200:-2:flags=lanczos" "$OUT/moveit-logo.png"
ffmpeg -v error -y -i "$SRC/fullstack/Crux Logo.png" -vf "scale=256:-2:flags=lanczos" "$OUT/crux-logo.png"
ls -la "$OUT"
