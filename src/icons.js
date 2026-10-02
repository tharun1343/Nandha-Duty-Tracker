/* Microsoft Fluent UI Emoji (3D), MIT licence — https://github.com/microsoft/fluentui-emoji */
const files = import.meta.glob('./icons/*.png', { eager: true, query: '?url', import: 'default' });
export const ICONS = Object.fromEntries(Object.entries(files).map(([path, url]) => [path.split('/').pop().replace('.png', ''), url]));
