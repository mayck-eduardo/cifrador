const chords = ["C", "C7M", "Am7", "Bm7", "F#4", "D/F#", "Em", "A Luz do sol", "Refrão", "C/Eb", "Bm7(b5)"];

function isChordToken(token) {
    if (!token) return false;
    // Allow standard chords and parentheses like (b5)
    return /^[A-G][b#]?(m|M|sus|add|maj|min|dim|aug)?\d*(m|M|sus|add|maj|min|dim|aug)?(\([^)]+\))?(?:\/[A-G][b#]?)?$/.test(token);
}

chords.forEach(c => {
    let tokens = c.split(/\s+/).filter(Boolean);
    let chordTokens = tokens.filter(isChordToken);
    console.log(`"${c}": ${chordTokens.length}/${tokens.length} -> isChordLine? ${chordTokens.length > 0 && chordTokens.length === tokens.length}`);
});
