const cheerio = require('cheerio');

async function test() {
  const res = await fetch('https://www.cifraclub.com.br/legiao-urbana/tempo-perdido/');
  const html = await res.text();
  const $ = cheerio.load(html);
  
  const preHtml = $('pre').html();
  if (preHtml) {
    console.log("PRE snippet:");
    console.log(preHtml.substring(0, 500));
  } else {
    console.log("No pre found");
  }
}
test();
