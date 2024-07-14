import { Content } from '../types/content';

export const contentToHtml = (content: Content): string => {
  if (typeof content === 'undefined') {
    return '';
  }
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((part) => contentToHtml(part)).join('');
  }
  switch (content.type) {
    case 'Paragraph':
      return `<p>${contentToHtml(content.content)}</p>`;
    case 'Emphasis':
      return `<em>${contentToHtml(content.content)}</em>`;
    case 'Strong':
      return `<strong>${contentToHtml(content.content)}</strong>`;
    case 'NontextualAnnotation':
      return `<u>${contentToHtml(content.content)}</u>`;
    case 'Superscript':
      return `<sup>${contentToHtml(content.content)}</sup>`;
    case 'Subscript':
      return `<sub>${contentToHtml(content.content)}</sub>`;
    default:
      return '';
  }
};
