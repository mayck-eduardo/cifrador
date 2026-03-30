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
    let tokens = line.split(/[\s\t]+/).filter(Boolean);
    if (tokens.length === 0) return false;
    
    // Ignore lines that are clearly tab headers or contain mostly dashes
    if (line.includes('|') || line.includes('---')) return false;
    if (line.toLowerCase().includes('[tab')) return false;

    let chordTokens = tokens.filter(isChordToken);
    if (chordTokens.length === 0) return false;

    let isMostlyChords = chordTokens.length / tokens.length > 0.5;
    let containsLowerCase = /[a-z]{3,}/.test(line.replace(/\[.*?\]/g, '')); 
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
  return title.replace(/[|:;\\\/_-]/g, ' ').replace(/\s+/g, ' ').trim();
}

export type MusicQueryOptions = {
    fontFamily?: string;
    transposeBy?: number; 
    pageSize?: 'DESKTOP' | 'MOBILE';
    formats?: string[]; // e.g., ['docx', 'pdf']
    removeTabs?: boolean;
    simplified?: boolean;
    colors?: {
        title: string;
        lyrics: string;
        chorus: string;
        preChorus: string;
        bridge: string;
        chords: string;
    }
};

async function fetchWithTimeout(url: string, options: any = {}, timeout = 25000) {
  console.log(`[Cifrador] Fetching: ${url} (timeout: ${timeout}ms)`);
  const controller = new AbortController();
  const id = setTimeout(() => {
    controller.abort();
    console.log(`[Cifrador] Timeout reached for: ${url}`);
  }, timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  };
}

function isTabLine(line: string) {
    const dashCount = (line.match(/-/g) || []).length;
    const barCount = (line.match(/\|/g) || []).length;
    const guitarNotation = (line.match(/^[abcdefg][#b]?\s*\|/i) || []).length;
    return (dashCount > 6) || (barCount > 2 && dashCount > 2) || (guitarNotation >= 1);
}


export async function processMusicQuery(query: string, options?: MusicQueryOptions) {
  const opts = {
      fontFamily: options?.fontFamily || 'Courier New',
      transposeBy: options?.transposeBy || 0,
      pageSize: options?.pageSize || 'DESKTOP',
      formats: options?.formats || ['docx', 'pdf'],
      removeTabs: options?.removeTabs || false,
      simplified: options?.simplified || false,
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
    console.log(`[Cifrador] Iniciando processamento para: "${searchTerm}"`);

    if (searchTerm.includes('youtube.com/') || searchTerm.includes('youtu.be/')) {
      console.log(`[Cifrador] Detectado link do YouTube, buscando título...`);
      const ytRes = await fetchWithTimeout(searchTerm, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } 
      });
      if (!ytRes.ok) throw new Error('Não foi possível acessar o YouTube.');
      const html = await ytRes.text();
      const $ = cheerio.load(html);
      searchTerm = cleanYoutubeTitle($('title').text() || '');
      console.log(`[Cifrador] Título extraído do YouTube: "${searchTerm}"`);
    }
    
    const commonHeaders = { 
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };

    let cifraUrl = '';

    // Direct CifraClub link support
    if (searchTerm.startsWith('http') && (searchTerm.includes('cifraclub.com.br/') || searchTerm.includes('cifras.com.br/'))) {
        cifraUrl = searchTerm;
        console.log(`[Cifrador] Usando link direto: ${cifraUrl}`);
    } else {
        // Search
        console.log(`[Cifrador] Buscando cifra para: ${searchTerm}`);
        // Usando DuckDuckGo LITE que é menos propenso a bloqueios de bot
        let searchUrl = 'https://duckduckgo.com/lite/?q=' + encodeURIComponent(`${searchTerm} cifra`);
        let searchRes = await fetchWithTimeout(searchUrl, { headers: commonHeaders });

        if (!searchRes.ok) {
            console.log(`[Cifrador] DuckDuckGo falhou (Status: ${searchRes.status}). Tentando Bing...`);
            searchUrl = 'https://www.bing.com/search?q=' + encodeURIComponent(`${searchTerm} cifra`);
            searchRes = await fetchWithTimeout(searchUrl, { headers: commonHeaders });
        }

        if (!searchRes.ok) throw new Error(`Falha na busca (Status: ${searchRes.status}). Tente novamente.`);
        
        const searchHtml = await searchRes.text();
        const $search = cheerio.load(searchHtml);
        
        // Log para diagnóstico se não encontrar nada
        const pageTitle = $search('title').text().trim();
        if (pageTitle.toLowerCase().includes('pardon') || pageTitle.toLowerCase().includes('bloqueio') || pageTitle.toLowerCase().includes('security')) {
            console.warn(`[Cifrador] Bloqueio detectado pelo buscador: "${pageTitle}"`);
        }

        // Selector universal: procura por QUALQUER link que contenha cifraclub ou cifras no href
        $search('a').each((_, el) => {
           let href = $search(el).attr('href');
           if (!href) return;

           let decodedUrl = href;
           // Limpeza de redirecionamentos (DuckDuckGo, Bing, etc)
           if (href.includes('uddg=')) {
              const urlParams = new URLSearchParams(href.split('?')[1]);
              decodedUrl = decodeURIComponent(urlParams.get('uddg') || '');
           } else if (href.includes('r.search.yahoo.com') || href.includes('bing.com/ck/')) {
              // Yahoo/Bing às vezes usam links complexos, mas a URL alvo costuma estar no href ou visível
           }

           // Normaliza URL
           if (decodedUrl.startsWith('//')) decodedUrl = 'https:' + decodedUrl;
           if (!decodedUrl.startsWith('http') && (decodedUrl.includes('cifraclub.com.br') || decodedUrl.includes('cifras.com.br'))) {
               decodedUrl = 'https://' + decodedUrl.replace(/^\/+/, '');
           }

           const isCifraClub = decodedUrl.includes('cifraclub.com.br/');
           const isCifras = decodedUrl.includes('cifras.com.br/');

           if ((isCifraClub || isCifras) && !decodedUrl.includes('/letra/') && !decodedUrl.includes('/musicos/') && !decodedUrl.includes('/academy/')) {
               try {
                   const urlObj = new URL(decodedUrl);
                   const paths = urlObj.pathname.split('/').filter(Boolean);
                   if (paths.length >= 1) {
                       cifraUrl = urlObj.href;
                       return false; // break loop
                   }
               } catch (e) { /* ignore invalid urls */ }
           }
        });
    }

    if (!cifraUrl) throw new Error(`Não foi possível encontrar a cifra para: ${searchTerm}. Tente um nome mais simples.`);
    
    // Remove qualquer fragmento ou query param anterior antes de remontar
    let cleanUrl = cifraUrl.split('#')[0].split('?')[0];
    if (cleanUrl.endsWith('/')) {
        // ok
    } else if (!cleanUrl.endsWith('.html')) {
        cleanUrl += '/';
    }

    // A lógica solicitada: usar o link que remove as tabs (#tabs=false)
    if (opts.simplified && !cleanUrl.includes('simplificada.html')) {
        cleanUrl = cleanUrl.replace(/\/$/, '') + '/simplificada.html';
    }

    const finalUrl = opts.removeTabs 
        ? (cleanUrl.includes('?') ? `${cleanUrl}&tabs=false#tabs=false` : `${cleanUrl}?tabs=false#tabs=false`)
        : cleanUrl;

    console.log(`[Cifrador] URL final processada: ${finalUrl}`);

    // Fetch cipher
    console.log(`[Cifrador] Baixando conteúdo da cifra...`);
    const cifraRes = await fetchWithTimeout(finalUrl, { 
      headers: { ...commonHeaders } 
    });
    if (!cifraRes.ok) throw new Error('Não foi possível acessar a página da cifra.');
    const cifraHtml = await cifraRes.text();
    const $cifra = cheerio.load(cifraHtml);
    
    // Seleção específica do bloco de cifra para evitar lixo de outras partes da página
    let preElement = $cifra('pre.cifra_cnt');
    if (preElement.length === 0) preElement = $cifra('#cifra_raw');
    if (preElement.length === 0) preElement = $cifra('pre').first();
    
    let rawCipher = preElement.text() || $cifra('.cifra_cnt').text() || $cifra('.ct_cifra').text() || '';
    if (!rawCipher) throw new Error('Conteúdo da cifra não encontrado na página.');
    
    // Limpeza profunda de tablaturas para simular o efeito do link #tabs=false
    if (opts.removeTabs) {
        console.log(`[Cifrador] Iniciando limpeza profunda de tablaturas...`);
        let lines = rawCipher.split('\n');
        
        // 1. Limpeza cirúrgica de rótulos de Tab em linhas de acordes
        let cleanedLines = lines.map(line => {
            let l = line;
            // Remove "[Tab - Intro]", "[Tab]", etc, mas mantém os acordes vizinhos
            l = l.replace(/\[\s*tab.*?\s*\]/gi, '');
            // Remove chord names soltos que costumam vir após o rótulo de Tab
            // ex: "[Tab - Intro] C7M" -> remove o C7M extra se estiver no fim
            l = l.replace(/\s+[A-G][b#]?(?:m|M|sus|add|maj|min|dim|aug)?\d*$/g, '');
            return l;
        });

        // 2. Filtro agressivo de linhas de tablatura
        rawCipher = cleanedLines.filter(line => {
            const l = line.trim();
            if (!l) return true; // Mantém linhas vazias para estrutura
            
            // Se for identificado como linha de tab (mais de 4 hifens ou barras verticais)
            const hyphenCount = (l.match(/-/g) || []).length;
            const barCount = (l.match(/\|/g) || []).length;
            if (barCount >= 1 && (hyphenCount > 3 || l.includes('|'))) return false;
            
            // Utilitário isTabLine mais abrangente
            if (isTabLine(l)) return false;
            
            // Setas de batida v v v ou ^ ^
            if (/^[v\^\>\s\d\.\~\/\|]+$/.test(l) && (l.includes('v') || l.includes('^')) && l.length > 1) return false;
            
            // Resíduos de "Parte X de Y" ou "Solo:" se seguidos de vazio
            if (/^Parte\s+\d+\s+de\s+\d+$/i.test(l)) return false;
            if (/^Solo:?\s*$/i.test(l)) return false;
            if (/^Dedilhado:?\s*$/i.test(l)) return false;
            
            return true;
        }).join('\n');
        
        // Remove blocos de linhas vazias excessivas que sobram da remoção
        rawCipher = rawCipher.replace(/\n\s*\n\s*\n/g, '\n\n');
    }

    const songName = $cifra('h1').first().text().trim() || searchTerm;
    const artistName = $cifra('.t3').text().trim() || $cifra('h2').first().text().trim() || 'Artista Desconhecido';

    let rawLines = rawCipher.split('\n');
    
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
        console.log(`[Cifrador] Gerando DOCX...`);
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
        console.log(`[Cifrador] Gerando PDF...`);
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
                // PDF-Lib standard fonts support WinAnsi (Portuguese accents)
                let cleanText = r.text.replace(/\r/g, '')
                                    .replace(/↓/g, 'v')
                                    .replace(/↑/g, '^')
                                    .replace(/[^\x00-\xFF]/g, ' '); // Keep Latin-1 characters (accents), remove others
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

    const finalFilename = `${artistName} - ${songName}`;
    console.log(`[Cifrador] Sucesso: ${finalFilename}`);
    return {
      success: true,
      data: docxBase64,
      pdfData: pdfBase64,
      filename: finalFilename
    };

  } catch (error: any) {
    console.error(`[Cifrador] ERRO:`, error);
    return { success: false, error: error.message || 'Ocorreu um erro desconhecido.' };
  }
}
