const ChordSheetJS = require('chordsheetjs');
const fs = require('fs');

const parser = new ChordSheetJS.TextParser();
const text = `
[Refrão]
   C                     G
A vida não é só de passagem
   Am                    F
Ela é para quem tem coragem
`;
const song = parser.parse(text);

console.log(song.lines[1].items[0].chord);
console.log(song.lines[1].items[0].lyrics);

const formatter = new ChordSheetJS.TextFormatter();
console.log("Original:\n", formatter.format(song));

// Transpose by +2 steps (whole step)
const songUp = song.transpose(2);
console.log("Transposed:\n", formatter.format(songUp));
