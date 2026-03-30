'use server';

import * as cheerio from 'cheerio';
import { Document, Packer, Paragraph, TextRun, convertMillimetersToTwip } from 'docx';

// -- TRANSPOSITION LOGIC --
const scale = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const scaleBemol = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function transposeNote(note: string, steps: number) {
    if (!note) return "";
    let isBemol = note.includes("b");
    let index = isBemol ? scaleBemol.indexOf(note) : scale.indexOf(note);
    if (index === -1) return note;
    let newIndex = (index + steps) % 12;
    if (newIndex < 0) newIndex += 12;
    return scale[newIndex];
}

function transposeChord(chordText: string, steps: number): string {
    if (steps === 0) return chordText;
    if (chordText.includes('/')) {
        let parts = chordText.split('/');
        return transposeChord(parts[0], steps) + '/' + transposeChord(parts[1], steps);
    }
    const match = chordText.match(/^([A-G][b#]?)(.*)$/);
    if (!match) return chordText;
    return transposeNote(match[1], steps) + match[2];
}

const chordPattern = /([A-G][b#]?(?:m|M|sus|add|maj|min|dim|aug)?\d*(?:m|M|sus|add|maj|min|dim|aug)?(?:\([^)]+\))?(?:\/[A-G][b#]?)?)/g;

function isChordToken(token: string) {
    if (!token) return false;
    return /^[A-G][b#]?(m|M|sus|add|maj|min|dim|aug)?\d*(m|M|sus|add|maj|min|dim|aug)?(\([^)]+\))?(?:\/[A-G][b#]?)?$/.test(token);
}

function isChordLine(line: string) {
    let tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return false;
    let chordTokens = tokens.filter(isChordToken);
    let isMostlyChords = chordTokens.length / tokens.length > 0.6;
    let containsLowerCase = /[a-z]{3,}/.test(line); 
    return isMostlyChords && !containsLowerCase;
}

function transposeLinePreservingSpacing(line: string, steps: number) {
    if (steps === 0) return line;
    let result = "";
    let regex = new RegExp(chordPattern);
    let match;
    let lastIndex = 0;

    while ((match = regex.exec(line)) !== null) {
        let original = match[0];
        if (isChordToken(original)) {
            let start = match.index;
            result += line.substring(lastIndex, start);
            let transposed = transposeChord(original, steps);
            result += transposed;
            
            let lengthDiff = transposed.length - original.length;
            let currentIdx = start + original.length;
            
            if (lengthDiff > 0) {
                while (lengthDiff > 0 && currentIdx < line.length && line[currentIdx] === ' ') {
                    currentIdx++;
                    lengthDiff--;
                }
            } else if (lengthDiff < 0) {
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

function cleanYoutubeTitle(title: string) {
  title = title.replace(/- YouTube$/i, '');
  const termsToRemove = [
    '(Official Video)', '[Official Video]', 'Official Video',
    '(Official Audio)', '[Official Audio]', 'Official Audio',
    '(Official Music Video)', '[Official Music Video]',
    '(Lyric Video)', '[Lyric Video]',
    '(Ao Vivo)', '[Ao Vivo]', 'Ao Vivo',
    '(Live)', '[Live]', 'Live',
    '(Videoclipe Oficial)', '[Videoclipe Oficial]', 'Videoclipe Oficial',
    '(Clipe Oficial)', '[Clipe Oficial]', 'Clipe Oficial',
    '(Video Oficial)', '[Video Oficial]'
  ];
  for (const term of termsToRemove) {
    title = title.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
  }
  return title.trim();
}

export type MusicQueryOptions = {
    fontFamily?: string;
    transposeBy?: number; 
    pageSize?: 'DESKTOP' | 'MOBILE';
    formats?: string[]; // e.g., ['docx', 'pdf']
    colors?: {
        title: string;
        lyrics: string;
        chorus: string;
        preChorus: string;
        bridge: string;
        chords: string;
    }
};

export async function processMusicQuery(query: string, options?: MusicQueryOptions) {
  const opts = {
      fontFamily: options?.fontFamily || 'Courier New',
      transposeBy: options?.transposeBy || 0,
      pageSize: options?.pageSize || 'DESKTOP',
      formats: options?.formats || ['docx'],
      colors: {
         title: (options?.colors?.title || '#2B6CB0').replace('#', ''),
         lyrics: (options?.colors?.lyrics || '#000000').replace('#', ''),
         chorus: (options?.colors?.chorus || '#E53E3E').replace('#', ''),
         preChorus: (options?.colors?.preChorus || '#D69E2E').replace('#', ''),
         bridge: (options?.colors?.bridge || '#805AD5').replace('#', ''),
         chords: (options?.colors?.chords || '#000000').replace('#', ''),
      }
  };

  try {
    let searchTerm = query.trim();
    if (searchTerm.includes('youtube.com/') || searchTerm.includes('youtu.be/')) {
      const ytRes = await fetch(searchTerm, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!ytRes.ok) throw new Error('Não foi possível acessar o YouTube.');
      const html = await ytRes.text();
      const $ = cheerio.load(html);
      searchTerm = cleanYoutubeTitle($('title').text() || '');
    }
    
    // Search
    const searchUrl = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(`site:cifraclub.com.br ${searchTerm}`);
    const searchRes = await fetch(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (!searchRes.ok) throw new Error('Falha ao buscar no DuckDuckGo.');
    const searchHtml = await searchRes.text();
    const $search = cheerio.load(searchHtml);
    
    let cifraUrl = '';
    $search('.result__snippet').each((_, el) => {
       const href = $search(el).parent().attr('href');
       if (href) {
         let decodedUrl = href;
         if (href.includes('uddg=')) {
            const urlParams = new URLSearchParams(href.split('?')[1]);
            decodedUrl = decodeURIComponent(urlParams.get('uddg') || '');
         }
         if (decodedUrl.includes('cifraclub.com.br/') && !decodedUrl.includes('/letra/')) {
           const urlObj = new URL(decodedUrl);
           const paths = urlObj.pathname.split('/').filter(Boolean);
           if (paths.length >= 2) {
             cifraUrl = decodedUrl;
             return false;
           }
         }
       }
    });

    if (!cifraUrl) {
       $search('.result__url').each((_, el) => {
          const text = $search(el).text().trim();
           if (text.includes('cifraclub.com.br/') && !text.includes('/letra/') && !text.includes('/academy/') && text.split('/').filter(Boolean).length >= 3) {
             cifraUrl = 'https://' + text;
             return false;
           }
       });
    }

    if (!cifraUrl) throw new Error(`Não foi possível encontrar a cifra para: ${searchTerm}`);

    // Fetch cipher
    const cifraRes = await fetch(cifraUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const cifraHtml = await cifraRes.text();
    const $cifra = cheerio.load(cifraHtml);
    
    const rawCipher = $cifra('pre').text() || $cifra('.cifra_cnt').text() || '';
    if (!rawCipher) throw new Error('Cifra não encontrada na página.');
    
    const songName = $cifra('h1.t1').text().trim() || searchTerm;
    const artistName = $cifra('.t3').text().trim() || 'Artista Desconhecido';

    const rawLines = rawCipher.split('\n');
    
    let pageWidthMM = opts.pageSize === 'MOBILE' ? 100 : 210;
    
    // Exact margins calculation
    let marginTopMM = 5;
    let marginBottomMM = 10;
    let marginLeftMM = 5;
    let marginRightMM = 10;
    
    let printableWidthMM = pageWidthMM - marginLeftMM - marginRightMM;
    let printableWidthPt = printableWidthMM * 2.83465; 
    
    // Process lengths
    let maxLineLength = 0;
    const processedLines = rawLines.map(line => {
        let transposed = transposeLinePreservingSpacing(line, opts.transposeBy);
        if (transposed.length > maxLineLength) maxLineLength = transposed.length;
        return { original: line, text: transposed, isChord: isChordLine(line) };
    });

    let requiredFontSizePt = printableWidthPt / (Math.max(maxLineLength, 1) * 0.65);
    let finalFontSizePt = Math.min(14, Math.max(6, requiredFontSizePt));
    let finalFontSizeHalfPt = Math.floor(finalFontSizePt * 2);

    // Structure generation
    let sectionColor = opts.colors.lyrics; 
    let isSoloSection = false;

    type RunData = { text: string; color: string; bold: boolean; isHighlight?: boolean; isChord?: boolean };
    const structuredParagraphs: RunData[][] = [];

    processedLines.forEach(lineObj => {
      const trimmed = lineObj.original.trim();
      const lower = trimmed.toLowerCase();
      
      if (lower.includes('[refrão]') || lower.includes('[refrao]') || lower.includes('[chorus]')) {
         sectionColor = opts.colors.chorus; 
      } else if (lower.includes('pré-refrão') || lower.includes('pre-refrão') || lower.includes('pre refrão') || lower.includes('pré refrão') || lower.includes('pre-chorus') || lower.includes('pré-chorus')) {
         sectionColor = opts.colors.preChorus;
      } else if (lower.includes('[ponte]') || lower.includes('[bridge]')) {
         sectionColor = opts.colors.bridge;
      } else if (lower.startsWith('[') && lower.endsWith(']')) {
         if (lower.includes('parte') || lower.includes('verso') || lower.includes('solo') || lower.includes('intro')) {
             sectionColor = opts.colors.lyrics; 
         }
      }

      let blocks = lineObj.text.split(/(\[.*?\])/g);
      let pRuns: RunData[] = [];

      for (let block of blocks) {
          if (!block) continue;
          let isBracket = block.startsWith('[') && block.endsWith(']');
          
          let color = sectionColor;
          let bold = false;
          let highlight = false;

          if (isBracket) {
              bold = true;
              highlight = true;
              color = "000000"; // Black contrast for yellow highlight
          } else if (lineObj.isChord) {
              bold = true;
              color = opts.colors.chords; 
          }

          pRuns.push({ text: block, color, bold, isHighlight: highlight, isChord: lineObj.isChord });
      }

      structuredParagraphs.push(pRuns);
    });

    let docxBase64 = null;
    let pdfBase64 = null;

    if (opts.formats.includes('docx')) {
        const paragraphElements = structuredParagraphs.map(pRuns => {
           if (pRuns.length === 0) return new Paragraph({ children: [] });
           
           return new Paragraph({
              children: pRuns.map(r => {
                 let props: any = {
                    text: r.text,
                    font: opts.fontFamily,
                    size: finalFontSizeHalfPt,
                    color: r.color,
                    bold: r.bold
                 };
                 if (r.isHighlight) props.highlight = "yellow";
                 return new TextRun(props);
              })
           });
        });

        const doc = new Document({
          creator: 'Cifrador Pro',
          sections: [{
            properties: { 
                page: {
                    size: {
                        width: convertMillimetersToTwip(pageWidthMM),
                        height: convertMillimetersToTwip(opts.pageSize === 'MOBILE' ? 300 : 297)
                    },
                    margin: {
                        top: convertMillimetersToTwip(marginTopMM),
                        bottom: convertMillimetersToTwip(marginBottomMM),
                        left: convertMillimetersToTwip(marginLeftMM),
                        right: convertMillimetersToTwip(marginRightMM)
                    }
                } 
            },
            children: [
              new Paragraph({
                children: [new TextRun({ text: songName, bold: true, size: 32, font: 'Arial', color: opts.colors.title })]
              }),
              new Paragraph({
                 children: [new TextRun({ text: artistName, size: 24, font: 'Arial', color: opts.colors.title })]
              }),
              new Paragraph({ children: [] }), 
              ...paragraphElements
            ]
          }]
        });

        const buffer = await Packer.toBuffer(doc);
        docxBase64 = buffer.toString('base64');
    }

    if (opts.formats.includes('pdf')) {
        const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
        
        function hexToRgbPdf(hexColor: string) {
            let cleanHex = hexColor.replace('#', '');
            if (cleanHex.length === 3) {
                cleanHex = cleanHex.split('').map(c => c + c).join('');
            }
            let r = parseInt(cleanHex.substring(0, 2), 16) / 255;
            let g = parseInt(cleanHex.substring(2, 4), 16) / 255;
            let b = parseInt(cleanHex.substring(4, 6), 16) / 255;
            return rgb(r, g, b);
        }

        const pdfDoc = await PDFDocument.create();
        const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const courier = await pdfDoc.embedFont(StandardFonts.Courier);
        const courierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

        const pWidth = opts.pageSize === 'MOBILE' ? 283.46 : 595.28;
        const pHeight = opts.pageSize === 'MOBILE' ? 850.39 : 841.89;
        
        const mTop = marginTopMM * 2.83465;
        const mBot = marginBottomMM * 2.83465;
        const mLeft = marginLeftMM * 2.83465;

        // Note: PDF coordinates: 0,0 is bottom-left, y goes UP.
        let page = pdfDoc.addPage([pWidth, pHeight]);
        let currentY = pHeight - mTop - 16; // Start from top, adjusted for text height

        page.drawText(songName, { x: mLeft, y: currentY, size: 16, font: helveticaBold, color: hexToRgbPdf(opts.colors.title) });
        currentY -= 20;
        page.drawText(artistName, { x: mLeft, y: currentY, size: 12, font: helvetica, color: hexToRgbPdf(opts.colors.title) });
        currentY -= 30;

        let lineHeight = finalFontSizePt * 1.25;

        structuredParagraphs.forEach(pRuns => {
            if (currentY < mBot + lineHeight) {
                page = pdfDoc.addPage([pWidth, pHeight]);
                currentY = pHeight - mTop - finalFontSizePt;
            }

            if (pRuns.length === 0) {
               currentY -= lineHeight;
               return;
            }

            let currentX = mLeft;
            for (let i = 0; i < pRuns.length; i++) {
               let r = pRuns[i];
               let textFont = r.bold ? courierBold : courier;
               let cleanText = r.text.replace(/\r/g, '');
               let textWidth = textFont.widthOfTextAtSize(cleanText, finalFontSizePt);
               
               let textColor = hexToRgbPdf(r.color);

               if (r.isHighlight) {
                   page.drawRectangle({
                       x: currentX,
                       y: currentY - (finalFontSizePt * 0.2), // Box padding
                       width: textWidth,
                       height: finalFontSizePt * 1.2, // Box height
                       color: rgb(1, 1, 0) // yellow
                   });
                   textColor = rgb(0, 0, 0); // black text
               }
               
               page.drawText(cleanText, {
                   x: currentX,
                   y: currentY,
                   size: finalFontSizePt,
                   font: textFont,
                   color: textColor
               });

               currentX += textWidth;
            }
            
            currentY -= lineHeight;
        });

        pdfBase64 = await pdfDoc.saveAsBase64();
    }

    return {
      success: true,
      data: docxBase64,
      pdfData: pdfBase64,
      filename: `${artistName} - ${songName}`
    };

  } catch (error: any) {
    console.error(error);
    return { success: false, error: error.message || 'Ocorreu um erro desconhecido.' };
  }
}
