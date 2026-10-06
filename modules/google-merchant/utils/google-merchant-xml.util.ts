import { IGoogleMerchantFeedItem } from '../interfaces/google-merchant-feed-item.interface';

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const cdata = (value: string): string => {
  const safe = value.replace(/]]>/g, ']]]]><![CDATA[>');
  return `<![CDATA[${safe}]]>`;
};

export const buildGoogleMerchantRssXml = (
  items: IGoogleMerchantFeedItem[],
  channel: { title: string; link: string; description: string },
): string => {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '<channel>',
    `<title>${escapeXml(channel.title)}</title>`,
    `<link>${escapeXml(channel.link)}</link>`,
    `<description>${escapeXml(channel.description)}</description>`,
    `<!-- itemCount=${items.length} -->`,
  ];

  for (const item of items) {
    lines.push('<item>');
    lines.push(`<g:id>${escapeXml(item.id)}</g:id>`);
    lines.push(`<g:title>${cdata(item.title)}</g:title>`);
    lines.push(`<g:description>${cdata(item.description || item.title)}</g:description>`);
    lines.push(`<g:link>${escapeXml(item.link)}</g:link>`);
    lines.push(`<g:image_link>${escapeXml(item.imageLink)}</g:image_link>`);
    for (const extra of item.additionalImageLinks.slice(0, 10)) {
      lines.push(`<g:additional_image_link>${escapeXml(extra)}</g:additional_image_link>`);
    }
    lines.push(`<g:availability>${item.availability}</g:availability>`);
    lines.push(`<g:price>${escapeXml(item.price)}</g:price>`);
    if (item.salePrice) {
      lines.push(`<g:sale_price>${escapeXml(item.salePrice)}</g:sale_price>`);
    }
    lines.push(`<g:condition>${item.condition}</g:condition>`);
    lines.push(`<g:brand>${cdata(item.brand)}</g:brand>`);
    if (item.gtin) {
      lines.push(`<g:gtin>${escapeXml(item.gtin)}</g:gtin>`);
    } else {
      lines.push('<g:identifier_exists>no</g:identifier_exists>');
    }
    lines.push(`<g:mpn>${escapeXml(item.mpn)}</g:mpn>`);
    lines.push(`<g:item_group_id>${escapeXml(item.itemGroupId)}</g:item_group_id>`);
    lines.push('</item>');
  }

  lines.push('</channel>');
  lines.push('</rss>');
  return `${lines.join('\n')}\n`;
};

export const formatInrPrice = (amount: number): string => `${amount.toFixed(2)} INR`;

export const stripHtmlToText = (value: string | null | undefined): string => {
  if (!value?.trim()) return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};
