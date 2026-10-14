/**
 * Tests for the feed reader shared by the app and the Supabase relay
 * (live/feedCore.ts). Each example below mirrors the structure of a real feed
 * the app reads (titles and links are made up).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeEntities, hashId, parseFeed, resizeImage } from "./feedCore";

// Condé Nast (Vogue Runway, British Vogue, GQ)
const VOGUE = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>Vogue</title>
<item><title>The Best Street Style Photos From the Spring 2027 Shows in Paris</title><link>https://www.vogue.com/slideshow/street-style-paris</link><guid isPermaLink="false">abc123</guid><pubDate>Wed, 07 Oct 2026 10:00:00 +0000</pubDate><media:content/><category>Runway</category><category>Fashion / Street Style</category><dc:creator>A Writer</dc:creator><media:thumbnail url="https://assets.vogue.com/photos/xyz/master/pass/Paris_SS27.jpg" width="1920" height="1280"/></item>
<item><title>Saint Laurent &amp; the Art of the Exit</title><link>https://www.vogue.com/article/ysl</link><guid>def456</guid><pubDate>Thu, 08 Oct 2026 09:00:00 +0000</pubDate><category>Runway</category><media:thumbnail url="https://assets.vogue.com/photos/abc/master/pass/YSL.jpg"/></item>
</channel></rss>`;

// Hearst (Harper's Bazaar, ELLE): image in <media:content url>, title in CDATA
const HEARST = `<rss><channel><item><title><![CDATA[Pops of Red Were Trending on the Runways]]></title><link>https://www.harpersbazaar.com/fashion/trends/a1/red/</link><pubDate>Wed, 14 Oct 2026 12:00:00 +0000</pubDate><media:content url="https://hips.hearstapps.com/hmg-prod/images/red.jpg"><media:credit>Getty</media:credit></media:content></item></channel></rss>`;

// Pinterest public profile feed: the image is inside ESCAPED HTML in <description>
const PINTEREST = `<rss version="2.0"><channel><title>Dior</title><item><title>Floral motifs at the Dior Summer 2027 Women’s Show</title><link>https://www.pinterest.com/pin/2069/</link><description>&lt;a href=&quot;https://www.pinterest.com/pin/2069/&quot;&gt;&lt;img src=&quot;https://i.pinimg.com/236x/c5/d3/87/c5d3.jpg&quot;&gt;&lt;/a&gt;Floral motifs…</description><pubDate>Tue, 13 Oct 2026 09:04:29 GMT</pubDate><guid>https://www.pinterest.com/pin/2069/</guid></item></channel></rss>`;

// YouTube channel feed (Atom)
const YOUTUBE = `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom"><title>CHANEL</title>
<entry><id>yt:video:IhKuV0OjV9I</id><yt:videoId>IhKuV0OjV9I</yt:videoId><title>The Finale of the CHANEL Spring Summer 2027 Show</title><link rel="alternate" href="https://www.youtube.com/watch?v=IhKuV0OjV9I"/><author><name>CHANEL</name></author><published>2026-10-06T10:00:00+00:00</published><media:group><media:thumbnail url="https://i2.ytimg.com/vi/IhKuV0OjV9I/hqdefault.jpg" width="480" height="360"/></media:group></entry>
</feed>`;

// Hypebeast: image only inside the article HTML (content:encoded, CDATA)
const HYPEBEAST = `<rss><channel><item><title>Martine Rose SS27 Collection</title><description><![CDATA[<p><img width="620" src="https://image-cdn.hypb.st/a.jpg?w=800&amp;q=90" /></p><div>Text</div>]]></description><link>https://hypebeast.com/2026/10/martine-rose-ss27</link><category><![CDATA[Fashion]]></category><pubDate>Wed, 14 Oct 2026 12:30:15 +0000</pubDate></item></channel></rss>`;

// Dazed (Atom): a text-only <summary> comes BEFORE the <content> that holds the picture
const DAZED = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>https://www.dazeddigital.com/71168</id><title type="text">A designer behind the season's most talked-about look</title><summary type="html">Words only</summary><published>2026-10-14T13:24:00Z</published><author><name>A Writer</name></author><link rel="alternate" href="https://www.dazeddigital.com/fashion/article/71168/1/x?utm_source=Link&amp;utm_medium=Link" /><content type="html"><![CDATA[<a href="#"><img src="https://images-prod.dazeddigital.com/786/a.jpg" alt="" /></a><p>Text</p>]]></content></entry></feed>`;

describe("parseFeed", () => {
  it("reads Condé Nast feeds: title, link, date, categories, thumbnail, author", () => {
    const [first, second] = parseFeed(VOGUE);
    expect(first.title).toBe("The Best Street Style Photos From the Spring 2027 Shows in Paris");
    expect(first.link).toBe("https://www.vogue.com/slideshow/street-style-paris");
    expect(first.published).toBe("2026-10-07T10:00:00.000Z");
    expect(first.categories).toEqual(["Runway", "Fashion / Street Style"]);
    expect(first.image).toBe("https://assets.vogue.com/photos/xyz/master/pass/Paris_SS27.jpg");
    expect(first.author).toBe("A Writer");
    expect(second.title).toBe("Saint Laurent & the Art of the Exit");
  });

  it("reads Hearst feeds (image in media:content, CDATA titles)", () => {
    const [entry] = parseFeed(HEARST);
    expect(entry.title).toBe("Pops of Red Were Trending on the Runways");
    expect(entry.image).toBe("https://hips.hearstapps.com/hmg-prod/images/red.jpg");
  });

  it("finds the image inside Pinterest's escaped HTML", () => {
    const [pin] = parseFeed(PINTEREST);
    expect(pin.image).toBe("https://i.pinimg.com/236x/c5/d3/87/c5d3.jpg");
    expect(pin.link).toBe("https://www.pinterest.com/pin/2069/");
  });

  it("reads YouTube's Atom feed, including the video id", () => {
    const [video] = parseFeed(YOUTUBE);
    expect(video.videoId).toBe("IhKuV0OjV9I");
    expect(video.link).toBe("https://www.youtube.com/watch?v=IhKuV0OjV9I");
    expect(video.published).toBe("2026-10-06T10:00:00.000Z");
    expect(video.image).toContain("ytimg.com/vi/IhKuV0OjV9I/");
  });

  it("finds an image inside article HTML (Hypebeast)", () => {
    const [entry] = parseFeed(HYPEBEAST);
    expect(entry.image).toBe("https://image-cdn.hypb.st/a.jpg?w=800&q=90");
    expect(entry.categories).toEqual(["Fashion"]);
  });

  it("finds the picture in <content> even when a text <summary> comes first (Dazed)", () => {
    const [entry] = parseFeed(DAZED);
    expect(entry.image).toBe("https://images-prod.dazeddigital.com/786/a.jpg");
    expect(entry.link).toBe("https://www.dazeddigital.com/fashion/article/71168/1/x?utm_source=Link&utm_medium=Link");
    expect(entry.summary).toBe("Words only");
    expect(entry.author).toBe("A Writer");
  });

  it("never throws on junk", () => {
    expect(parseFeed("not xml at all")).toEqual([]);
    expect(parseFeed("<rss><item><title>no end")).toEqual([]);
  });
});

describe("resizeImage (asks each publisher's image server for a sensible size)", () => {
  it("Condé Nast", () => {
    expect(resizeImage("https://assets.vogue.com/photos/xyz/master/pass/A.jpg", 640)).toBe(
      "https://assets.vogue.com/photos/xyz/master/w_640,c_limit/A.jpg",
    );
  });
  it("Pinterest", () => {
    expect(resizeImage("https://i.pinimg.com/236x/c5/d3/87/c5d3.jpg", 640)).toBe("https://i.pinimg.com/736x/c5/d3/87/c5d3.jpg");
  });
  it("Hearst", () => {
    expect(resizeImage("https://hips.hearstapps.com/hmg-prod/images/red.jpg", 640)).toBe(
      "https://hips.hearstapps.com/hmg-prod/images/red.jpg?resize=640%3A*",
    );
  });
  it("leaves unknown hosts alone", () => {
    expect(resizeImage("https://example.com/a.jpg", 640)).toBe("https://example.com/a.jpg");
  });
});

describe("helpers", () => {
  it("decodes entities and CDATA", () => {
    expect(decodeEntities("Fish &amp; Chips &#39;n&#x2019; <![CDATA[<b>bold</b>]]>")).toBe("Fish & Chips 'n’ <b>bold</b>");
  });

  it("makes stable, short ids", () => {
    expect(hashId("https://www.vogue.com/a")).toBe(hashId("https://www.vogue.com/a"));
    expect(hashId("https://www.vogue.com/a")).not.toBe(hashId("https://www.vogue.com/b"));
  });
});

describe("files that exist in two places", () => {
  it("feedCore.ts: the app's and the relay's copies are identical — copy one over the other after editing", () => {
    const app = fs.readFileSync(path.resolve(__dirname, "feedCore.ts"), "utf8");
    const relay = fs.readFileSync(path.resolve(__dirname, "../../supabase/functions/live-feed/feedCore.ts"), "utf8");
    expect(relay).toBe(app);
  });

  it("pinterestStore.ts: the two server functions' copies are identical", () => {
    const feed = fs.readFileSync(path.resolve(__dirname, "../../supabase/functions/live-feed/pinterestStore.ts"), "utf8");
    const auth = fs.readFileSync(path.resolve(__dirname, "../../supabase/functions/pinterest-auth/pinterestStore.ts"), "utf8");
    expect(auth).toBe(feed);
  });
});
