#!/usr/bin/env bash
# Draft animatic (storyboard video) from the captured frames and the subtitle files. Free tools only (ffmpeg). Run from this folder:
#   bash build-animatic.sh he      or      bash build-animatic.sh en
# The output is a DRAFT for approving timing and wording: the frames come from demo mode, so they carry "demo" labels and pre-written texts.
set -euo pipefail
L="${1:?he or en}"
D=(5 6 5 5 3 3 7 4 2)               # seconds per segment, 40 s in all (matches 10-video-script-and-storyboard.md)
F=(01 02 03 04 05 06 07 08 01)      # frame per segment (the last one returns to the opening / logo)
ARGS=(); FILTER=""
for i in "${!D[@]}"; do
  ARGS+=(-loop 1 -t "${D[$i]}" -i "frames/${L}-${F[$i]}.jpg")
  FILTER+="[$i:v]scale=1280:800:flags=lanczos,setsar=1,fps=25,fade=t=in:st=0:d=0.3[v$i];"
done
CONCAT=""; for i in "${!D[@]}"; do CONCAT+="[v$i]"; done
STYLE="FontName=Arial,FontSize=11,PrimaryColour=&HFFFFFF&,BackColour=&H99000000&,BorderStyle=3,Outline=3,Shadow=0,MarginV=16,Alignment=2"
ffmpeg -y -hide_banner -loglevel error "${ARGS[@]}" \
  -filter_complex "${FILTER}${CONCAT}concat=n=${#D[@]}:v=1:a=0,subtitles=explainer-${L}.srt:force_style='${STYLE}'[out]" \
  -map "[out]" -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart "explainer-draft-${L}.mp4"
ls -la "explainer-draft-${L}.mp4"
