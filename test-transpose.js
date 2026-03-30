const { Document, Packer, Paragraph, TextRun, convertInchesToTwip } = require('docx');

const scale = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const scaleBemol = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function transposeNote(note, steps) {
    if (!note) return "";
    let isBemol = note.includes("b");
    let index = isBemol ? scaleBemol.indexOf(note) : scale.indexOf(note);
    if (index === -1) return note;
    let newIndex = (index + steps) % 12;
    if (newIndex < 0) newIndex += 12;
    // Keep accidental type consistent or use sharp by default
    return scale[newIndex];
}

function transposeChord(chordText, steps) {
    if (steps === 0) return chordText;
    if (chordText.includes('/')) {
        let parts = chordText.split('/');
        return transposeChord(parts[0], steps) + '/' + transposeChord(parts[1], steps);
    }
    const match = chordText.match(/^([A-G][b#]?)(.*)$/);
    if (!match) return chordText;
    return transposeNote(match[1], steps) + match[2];
}

// Regex to find chords within a line
const chordPattern = /([A-G][b#]?(?:m|M|sus|add|maj|min|dim|aug)?\d*(?:m|M|sus|add|maj|min|dim|aug)?(?:\([^)]+\))?(?:\/[A-G][b#]?)?)/g;

function isChordToken(token) {
    if (!token) return false;
    return /^[A-G][b#]?(m|M|sus|add|maj|min|dim|aug)?\d*(m|M|sus|add|maj|min|dim|aug)?(\([^)]+\))?(?:\/[A-G][b#]?)?$/.test(token);
}

function isChordLine(line) {
    let tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return false;
    // We expect chords, maybe pipe `|` characters
    let chordTokens = tokens.filter(isChordToken);
    let isMostlyChords = chordTokens.length / tokens.length > 0.6;
    let containsLowerCase = /[a-z]{3,}/.test(line); // Usually lyrics have words
    return isMostlyChords && !containsLowerCase;
}

function transposeLinePreservingSpacing(line, steps) {
    if (steps === 0) return line;
    let result = "";
    let i = 0;

    // Use regex exec to find all chords and their positions
    let regex = new RegExp(chordPattern);
    let match;
    let lastIndex = 0;

    while ((match = regex.exec(line)) !== null) {
        let original = match[0];
        // Check if it's REALLY a chord
        if (isChordToken(original)) {
            let start = match.index;
            // Add previous text
            result += line.substring(lastIndex, start);
            
            let transposed = transposeChord(original, steps);
            result += transposed;
            
            // Adjust spaces after the chord to maintain string length if possible
            let lengthDiff = transposed.length - original.length;
            let currentIdx = start + original.length;
            
            // If the transposed chord is longer, "eat" up to 'lengthDiff' spaces after it
            if (lengthDiff > 0) {
                while (lengthDiff > 0 && currentIdx < line.length && line[currentIdx] === ' ') {
                    currentIdx++;
                    lengthDiff--;
                }
            }
            // If the transposed chord is shorter, pad with spaces
            else if (lengthDiff < 0) {
                result += ' '.repeat(-lengthDiff);
            }
            
            lastIndex = currentIdx;
            regex.lastIndex = currentIdx;
        } else {
            result += line.substring(lastIndex, match.index + original.length);
            lastIndex = match.index + original.length;
            regex.lastIndex = lastIndex;
        }
    }
    result += line.substring(lastIndex);
    return result;
}

console.log(transposeLinePreservingSpacing("C      Am     Dm7      G7", 2));
console.log("D      Bm     Em7      A7" + " <- TARGET");
console.log(transposeLinePreservingSpacing("F#m7(b5)  B7", -2));
