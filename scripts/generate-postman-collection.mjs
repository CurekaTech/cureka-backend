/**
 * Generates docs/postman/cureka-api.postman_collection.json from NestJS controllers + DTOs.
 * Run: node scripts/generate-postman-collection.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'docs', 'postman', 'cureka-api.postman_collection.json');


function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function titleCase(s) {
  return s
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizePath(p) {
  return p
    .split('/')
    .filter(Boolean)
    .map((seg) => (seg.startsWith(':') ? `{${seg.slice(1)}}` : seg))
    .join('/');
}

function extractStringArg(raw) {
  const m = String(raw || '').match(/['"`]([^'"`]*)['"`]/);
  return m ? m[1] : '';
}

function joinUrl(base, extra) {
  const a = (base || '').replace(/^\/+|\/+$/g, '');
  const b = (extra || '').replace(/^\/+|\/+$/g, '');
  if (!a) return b;
  if (!b) return a;
  return `${a}/${b}`;
}

function collectFiles(exts, roots) {
  const files = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const f of walk(root)) {
      if (exts.some((e) => f.endsWith(e))) files.push(f);
    }
  }
  return files;
}

// ── Enums ───────────────────────────────────────────────────────────────────

function parseEnums() {
  const enums = new Map();
  const files = collectFiles(
    ['.enum.ts', '.constants.ts'],
    [path.join(ROOT, 'modules'), path.join(ROOT, 'packages')],
  );
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const enumRe = /export\s+enum\s+(\w+)\s*\{([^}]+)\}/g;
    let m;
    while ((m = enumRe.exec(src))) {
      const values = [];
      const body = m[2];
      const valRe = /(\w+)\s*=\s*['"`]([^'"`]+)['"`]/g;
      let v;
      while ((v = valRe.exec(body))) values.push(v[2]);
      if (values.length) enums.set(m[1], values);
    }
    const constArrRe = /export\s+const\s+(\w+)\s*=\s*\[([^\]]+)\]\s+as\s+const/g;
    while ((m = constArrRe.exec(src))) {
      const values = [...m[2].matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1]);
      if (values.length) enums.set(m[1], values);
    }
  }
  return enums;
}

// ── DTOs ────────────────────────────────────────────────────────────────────

function parseClassBlocks(src) {
  const classes = [];
  const re = /export\s+class\s+(\w+)(?:\s+extends\s+([^{]+))?\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    const extendsRaw = (m[2] || '').trim();
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    classes.push({
      name,
      extendsRaw,
      body: src.slice(start, i - 1),
    });
  }
  return classes;
}

function parseDtoProperty(block) {
  const lines = block.split('\n');
  let name = null;
  let typeRaw = 'string';
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line || line.startsWith('@') || line.startsWith('//') || line.startsWith('*')) continue;
    const decl = line.match(/^(?:readonly\s+)?(\w+)\s*[?!]?\s*:\s*([^;=]+)/);
    if (decl) {
      name = decl[1];
      typeRaw = decl[2].trim().replace(/;$/, '');
      break;
    }
  }
  if (!name || ['constructor', 'if', 'return', 'const', 'let'].includes(name)) return null;
  const exampleMatch = block.match(/example:\s*('(?:\\.|[^'])*'|"(?:\\.|[^"])*"|`(?:\\.|[^`])*`|[\w.-]+|true|false)/);
  let example;
  if (exampleMatch) {
    const raw = exampleMatch[1];
    if (raw === 'true') example = true;
    else if (raw === 'false') example = false;
    else if (/^-?\d+(\.\d+)?$/.test(raw)) example = Number(raw);
    else example = raw.replace(/^['"`]|['"`]$/g, '');
  }

  const enumMatch = block.match(/@IsEnum\((\w+)\)/) || block.match(/enum:\s*(\w+)/);
  const inMatch = block.match(/@IsIn\(\[([^\]]+)\]\)/);
  const inValues = inMatch
    ? [...inMatch[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1])
    : [];

  return {
    name,
    typeRaw,
    optional: /@IsOptional\b/.test(block) || /\w+\?:/.test(block),
    isArray: /@IsArray\b/.test(block) || /\[\]/.test(typeRaw) || /Array</.test(typeRaw),
    isBoolean: /@IsBoolean\b/.test(block) || /\bboolean\b/.test(typeRaw),
    isNumber:
      /@IsInt\b/.test(block) ||
      /@IsNumber\b/.test(block) ||
      /\bnumber\b/.test(typeRaw),
    isUuid: /@IsUUID\b/.test(block),
    isEmail: /@IsEmail\b/.test(block),
    isObject: /@IsObject\b/.test(block),
    enumName: enumMatch ? enumMatch[1] : null,
    inValues,
    example,
    nestedType: nestedTypeName(typeRaw),
  };
}

function nestedTypeName(typeRaw) {
  const cleaned = typeRaw.replace(/\s+/g, ' ').trim();
  const arr = cleaned.match(/^(\w+)\[\]$/);
  if (arr) return arr[1];
  const gen = cleaned.match(/^(?:Array|Partial)<\s*(\w+)\s*>$/);
  if (gen) return gen[1];
  const simple = cleaned.match(/^(\w+)$/);
  if (simple && !['string', 'number', 'boolean', 'unknown', 'any', 'Date', 'object'].includes(simple[1])) {
    return simple[1];
  }
  return null;
}

function parseDtos(enums) {
  const dtos = new Map();
  const files = collectFiles(['.dto.ts'], [path.join(ROOT, 'modules'), path.join(ROOT, 'packages')]);
  for (const file of files) {
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    for (const cls of parseClassBlocks(src)) {
      const props = [];
      const chunks = cls.body.split(/(?=\n\s*@)/);
      for (const chunk of chunks) {
        const prop = parseDtoProperty(chunk);
        if (prop) props.push(prop);
      }
      let parent = null;
      let partial = false;
      const ext = cls.extendsRaw;
      if (ext) {
        const partialMatch = ext.match(/PartialType\(\s*(\w+)/);
        if (partialMatch) {
          parent = partialMatch[1];
          partial = true;
        } else {
          const simple = ext.match(/^(\w+)/);
          if (simple) parent = simple[1];
        }
      }
      dtos.set(cls.name, { name: cls.name, props, parent, partial, file });
    }
  }
  return dtos;
}

function resolveDtoProps(dtos, name, seen = new Set()) {
  if (!name || !dtos.has(name) || seen.has(name)) return [];
  seen.add(name);
  const dto = dtos.get(name);
  const inherited = dto.parent ? resolveDtoProps(dtos, dto.parent, seen) : [];
  const own = dto.props;
  const merged = new Map();
  for (const p of inherited) merged.set(p.name, { ...p, optional: dto.partial ? true : p.optional });
  for (const p of own) merged.set(p.name, p);
  return [...merged.values()];
}

function sampleValue(prop, enums, dtos, depth = 0) {
  if (prop.example !== undefined) return prop.example;
  if (prop.enumName && enums.has(prop.enumName)) return enums.get(prop.enumName)[0];
  if (prop.inValues.length) return prop.inValues[0];
  if (prop.isArray) {
    if (prop.nestedType && dtos.has(prop.nestedType) && depth < 3) {
      return [buildBody(prop.nestedType, dtos, enums, depth + 1)];
    }
    if (prop.name.toLowerCase().includes('keyword')) return ['sample'];
    if (/RefIds?$/i.test(prop.name) || /Ids?$/i.test(prop.name)) return [`{{${prop.name.replace(/s$/, '')}}}`];
    return [];
  }
  if (prop.isObject) return {};
  if (prop.nestedType && dtos.has(prop.nestedType) && depth < 3) {
    return buildBody(prop.nestedType, dtos, enums, depth + 1);
  }
  if (prop.isBoolean) return true;
  if (prop.isNumber) {
    if (/page/i.test(prop.name)) return 1;
    if (/limit/i.test(prop.name)) return 20;
    if (/quantity|qty/i.test(prop.name)) return 1;
    if (/price|mrp|amount|total/i.test(prop.name)) return 999;
    if (/stock/i.test(prop.name)) return 100;
    if (/days|months/i.test(prop.name)) return 30;
    if (/sortOrder|index|packNumber/i.test(prop.name)) return 0;
    return 1;
  }
  if (prop.isEmail) return 'admin@example.com';
  if (prop.isUuid || /(?:^|Id)$/.test(prop.name)) return `{{${prop.name}}}`;
  if (/RefId$/i.test(prop.name)) return `{{${prop.name}}}`;
  const named = {
    email: 'admin@example.com',
    password: 'your-password',
    identifier: '9876543210',
    mobileNumber: '9876543210',
    phoneNumber: '9876543210',
    otp: '123456',
    firstName: 'John',
    lastName: 'Doe',
    recipientName: 'Rahul Sharma',
    name: 'Sample Name',
    slug: 'sample-slug',
    couponCode: 'SAVE10',
    currency: 'INR',
    reason: 'Sample reason',
    status: 'active',
    otp: '123456',
    pincode: '560001',
    city: 'Bengaluru',
    state: 'Karnataka',
    addressLine1: '42, MG Road',
    addressLine2: 'Near Metro Station',
    landmark: 'Opposite City Mall',
    kpToken: 'your-kwikpass-token',
    refreshToken: '{{userSessionToken}}',
    description: 'Sample description',
    question: 'Can it be used daily?',
    answer: 'Yes, as directed on the label.',
    sku: 'SKU001',
    folder: 'images',
  };
  if (named[prop.name] !== undefined) return named[prop.name];
  if (/url/i.test(prop.name)) return 'https://example.com/sample.jpg';
  if (/date/i.test(prop.name)) return '2026-08-15';
  return '';
}

function buildBody(dtoName, dtos, enums, depth = 0) {
  const props = resolveDtoProps(dtos, dtoName);
  const obj = {};
  for (const prop of props) {
    obj[prop.name] = sampleValue(prop, enums, dtos, depth);
  }
  return obj;
}

function buildQueryParams(dtoName, dtos, enums) {
  const props = resolveDtoProps(dtos, dtoName);
  return props.map((prop) => {
    const value = sampleValue(prop, enums, dtos);
    const enabled = ['page', 'limit'].includes(prop.name);
    return {
      key: prop.name,
      value: value === undefined || value === null ? '' : String(value),
      disabled: !enabled && prop.optional,
      description: prop.enumName && enums.has(prop.enumName) ? enums.get(prop.enumName).join(' | ') : undefined,
    };
  });
}

// ── Controllers ─────────────────────────────────────────────────────────────

function matchingParenContents(src, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return src.slice(openIndex + 1, i);
    }
  }
  return '';
}

function parseControllerFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const src = stripComments(raw);
  const controllerMatch = src.match(/@Controller\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/);
  if (!controllerMatch) return [];
  const controllerPath = controllerMatch[1] ?? controllerMatch[2] ?? '';

  const classStart = src.search(/export\s+class\s+\w+/);
  if (classStart < 0) return [];
  const preamble = src.slice(0, classStart);
  const classGuards = [...preamble.matchAll(/@UseGuards\(([^)]+)\)/g)].map((m) => m[1]);

  const requests = [];
  const methodRe = /^\s+(?:async\s+)?([a-z][A-Za-z0-9]*)\s*\(/gm;
  let fn;
  while ((fn = methodRe.exec(src))) {
    if (fn[1] === 'constructor') continue;
    const fnName = fn[1];
    const openParen = fn.index + fn[0].length - 1;
    const paramsSrc = matchingParenContents(src, openParen);

    const before = src.slice(0, fn.index);
    const prevEnd = Math.max(before.lastIndexOf('\n  }'), before.lastIndexOf('\n}'));
    const decoratorBlock = src.slice(prevEnd + 1, fn.index);
    const httpMatch = [...decoratorBlock.matchAll(/@(Get|Post|Put|Patch|Delete)\(([^)]*)\)/g)].pop();
    if (!httpMatch) continue;

    const method = httpMatch[1].toUpperCase();
    const routePath = extractStringArg(httpMatch[2]);
    const fullPath = joinUrl(controllerPath, routePath);
    const methodGuards = [...decoratorBlock.matchAll(/@UseGuards\(([^)]+)\)/g)].map((x) => x[1]);
    const summaryMatch = decoratorBlock.match(/@ApiOperation\(\s*\{\s*summary:\s*['"`]([^'"`]+)['"`]/);
    const descMatch = decoratorBlock.match(/@ResponseMessage\(\s*['"`]([^'"`]+)['"`]/);

    const bodyMatch = paramsSrc.match(/@Body\(\)\s+\w+\s*:\s*(\w+)(\[\])?/);
    const queryDtoMatch = paramsSrc.match(/@Query\(\)\s+\w+\s*:\s*(\w+)/);
    const namedQueries = [...paramsSrc.matchAll(/@Query\(\s*['"`](\w+)['"`]/g)].map((x) => x[1]);
    const apiQueries = [...decoratorBlock.matchAll(/@ApiQuery\(\s*\{([^}]+)\}/g)].map((x) => {
      const name = (x[1].match(/name:\s*['"`](\w+)['"`]/) || [])[1];
      const required = /required:\s*true/.test(x[1]);
      const desc = (x[1].match(/description:\s*['"`]([^'"`]+)['"`]/) || [])[1];
      return name ? { name, required, desc } : null;
    }).filter(Boolean);

    requests.push({
      file,
      controllerPath,
      method,
      routePath,
      fullPath,
      fnName,
      name: summaryMatch?.[1] || `${method} /${humanizePath(fullPath)}`.replace(/\/$/, ''),
      description: descMatch?.[1] || '',
      auth: inferAuth([...classGuards, ...methodGuards].join(','), fullPath, file),
      bodyDto: bodyMatch?.[1] || null,
      bodyIsArray: Boolean(bodyMatch?.[2]),
      queryDto: queryDtoMatch?.[1] || null,
      namedQueries,
      apiQueries,
      pathParams: [...fullPath.matchAll(/:([A-Za-z0-9_]+)/g)].map((x) => x[1]),
      isMultipart:
        /@Req\(\)\s+\w+\s*:\s*FastifyRequest/.test(paramsSrc) &&
        !bodyMatch &&
        ['POST', 'PUT', 'PATCH'].includes(method) &&
        /upload|createFromRequest|multipart|folder/i.test(`${decoratorBlock} ${file} ${fnName}`),
    });
  }
  return requests;
}

function inferAuth(guards, urlPath, file) {
  const p = (urlPath || '').toLowerCase();
  const g = `${guards} ${file}`.toLowerCase();
  const requiredSession = g.replace(/optionalsessioncookieguard/g, '').includes('sessioncookieguard');
  if (/webhook/.test(p) || /webhook/.test(g)) return 'none';
  if (
    /^(auth\/admin\/login|auth\/login|auth\/send-otp|auth\/verify-otp|auth\/guest-login|auth\/refresh|auth\/kwikpass)/.test(
      p,
    )
  ) {
    return 'none';
  }
  if (/^(public|cms|health)(\/|$)/.test(p)) return 'none';
  if (/jwtauthguard/.test(g) || /(?:^|\/)admin(?:\/|$)/.test(p) || /[/\\]admin-/.test(file)) {
    return 'admin';
  }
  if (requiredSession) return 'customer';
  if (/^auth(\/|$)/.test(p)) return 'none';
  if (/master\/|products|bundle|gallery|uploads|roles|permissions|staff-users|admin-users|blog\/|support\/(faqs|categories|articles)/.test(p)) {
    return 'admin';
  }
  return 'inherit';
}

function folderFor(req) {
  const p = req.fullPath;
  if (p.startsWith('health')) return ['Health'];
  if (p.startsWith('auth/admin')) return ['Auth', 'Admin'];
  if (p.startsWith('auth')) return ['Auth', 'Customer'];

  if (p.startsWith('public/homepage')) return ['Public Storefront', 'Homepage'];
  if (p.startsWith('public/products')) return ['Public Storefront', 'Products'];
  if (p.startsWith('public/bundles')) return ['Public Storefront', 'Bundles'];
  if (p.startsWith('public/search')) return ['Public Storefront', 'Search'];
  if (p.startsWith('public/support')) return ['Public Storefront', 'Support'];
  if (p.startsWith('public/blog')) return ['Public Storefront', 'Blog'];
  if (p.startsWith('public/watch-and-shop') || p.startsWith('public/expert-talks')) {
    return ['Public Storefront', 'Content'];
  }
  if (p.startsWith('public/vendors')) return ['Public Storefront', 'Vendors'];
  if (p.startsWith('public/checkout')) return ['Public Storefront', 'Checkout'];
  if (p.startsWith('public/') || p.startsWith('cms')) return ['Public Storefront', 'Common'];

  if (p.startsWith('cart')) return ['Customer', 'Cart'];
  if (p.startsWith('orders') && !p.startsWith('admin/')) return ['Customer', 'Orders'];
  if (p.startsWith('wishlist')) return ['Customer', 'Wishlist'];
  if (p.startsWith('users/addresses')) return ['Customer', 'Addresses'];
  if (p.startsWith('users') && /\/(me|profile)/.test(p)) return ['Customer', 'Profile'];
  if (p.startsWith('subscriptions/products')) return ['Customer', 'Product Subscriptions'];
  if (p.startsWith('memberships') && !p.startsWith('admin/')) return ['Customer', 'Memberships'];
  if (p.startsWith('payment-requests') && !p.startsWith('admin/')) return ['Customer', 'Payment Requests'];
  if (p.startsWith('support/tickets') && !p.startsWith('admin/')) return ['Customer', 'Support Tickets'];
  if (p.startsWith('shipments/orders')) return ['Customer', 'Shipments'];

  if (p.startsWith('admin/dashboard')) return ['Admin', 'Dashboard'];
  if (p.startsWith('admin/reports')) return ['Admin', 'Reports'];
  if (p.startsWith('admin/orders')) return ['Admin', 'Orders'];
  if (p.startsWith('admin/customers')) return ['Admin', 'Customers'];
  if (p.startsWith('admin/vendors')) return ['Admin', 'Vendors'];
  if (p.startsWith('admin/subscriptions')) return ['Admin', 'Product Subscriptions'];
  if (p.startsWith('admin/memberships/plans')) return ['Admin', 'Membership Plans'];
  if (p.startsWith('admin/memberships')) return ['Admin', 'Memberships'];
  if (p.startsWith('admin/payment-requests')) return ['Admin', 'Payment Requests'];
  if (p.startsWith('admin/settings')) return ['Admin', 'Settings'];
  if (p.startsWith('admin/best-sellers')) return ['Admin', 'Best Sellers'];
  if (p.startsWith('admin/support')) return ['Admin', 'Support'];

  if (p.startsWith('products/bulk-upload')) return ['Admin', 'Products', 'Bulk Upload'];
  if (p.startsWith('products/') && p.includes('/variants')) return ['Admin', 'Products', 'Variants'];
  if (p.startsWith('product-faqs') || p.includes('/product-faqs')) return ['Admin', 'Products', 'FAQs'];
  if (p.startsWith('product-reviews')) return ['Admin', 'Products', 'Reviews'];
  if (p.startsWith('product-tags')) return ['Admin', 'Products', 'Tags'];
  if (p.startsWith('product-information-labels')) return ['Admin', 'Products', 'Information Labels'];
  if (p.startsWith('bundle-products')) return ['Admin', 'Bundle Products'];
  if (p.startsWith('products') || p.startsWith('master/product-wizard')) return ['Admin', 'Products'];

  if (p.startsWith('users')) return ['Admin', 'Users'];
  if (p.startsWith('staff-users')) return ['Admin', 'Staff Users'];
  if (p.startsWith('admin-users')) return ['Admin', 'Admin Users'];
  if (p.startsWith('roles')) return ['Admin', 'Roles'];
  if (p.startsWith('permissions')) return ['Admin', 'Permissions'];

  if (p.startsWith('master/')) {
    const rest = p.split('/')[1] || 'other';
    return ['Admin', 'Masters', titleCase(rest)];
  }
  if (p.startsWith('blog/')) return ['Admin', 'Blog', titleCase(p.split('/')[1] || 'posts')];
  if (p.startsWith('support/')) return ['Admin', 'Support', titleCase(p.split('/')[1] || 'support')];
  if (p.startsWith('gallery') || p.startsWith('uploads')) return ['Admin', 'Media'];

  if (p.startsWith('gokwik/webhooks')) return ['Webhooks & Integrations', 'GoKwik'];
  if (p.startsWith('gokwik/admin')) return ['GoKwik', 'Admin'];
  if (p.startsWith('gokwik')) return ['GoKwik', 'Checkout'];
  if (p.startsWith('payment/webhook') || p === 'shipments/webhook') {
    return ['Webhooks & Integrations', 'Payments & Shipping'];
  }
  if (p.startsWith('unicommerce')) return ['Webhooks & Integrations', 'Unicommerce'];

  return ['Other'];
}

function pathToPostman(fullPath) {
  return fullPath.split('/').filter(Boolean).map((seg) => {
    if (seg.startsWith(':')) return `{{${seg.slice(1)}}}`;
    if (seg === '*') return '{{shopPath}}';
    return seg;
  });
}

function requestAuth(auth) {
  if (auth === 'none') return { type: 'noauth' };
  if (auth === 'customer') {
    return {
      type: 'bearer',
      bearer: [{ key: 'token', value: '{{userSessionToken}}', type: 'string' }],
    };
  }
  if (auth === 'admin') {
    return {
      type: 'bearer',
      bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }],
    };
  }
  return undefined;
}

function loginTestScript(kind) {
  if (kind === 'admin') {
    return [
      'const res = pm.response.json();',
      'const token = res?.data?.accessToken;',
      'if (res.success && token) {',
      "  pm.collectionVariables.set('accessToken', token);",
      "  console.log('accessToken saved');",
      '}',
    ];
  }
  return [
    'const res = pm.response.json();',
    'const token = res?.data?.token || res?.data?.sessionToken;',
    'if (res.success && token) {',
    "  pm.collectionVariables.set('userSessionToken', token);",
    "  console.log('userSessionToken saved');",
    '}',
    'if (res?.data?.user?.id) pm.collectionVariables.set("userId", res.data.user.id);',
    'if (res?.data?.sessionId) pm.collectionVariables.set("sessionId", res.data.sessionId);',
  ];
}

function refIdScript(varName) {
  return [
    'const res = pm.response.json();',
    `if (res.success && res.data && res.data.refId) pm.collectionVariables.set('${varName}', res.data.refId);`,
    `if (res.success && res.data && res.data.id) pm.collectionVariables.set('${varName.replace('RefId', 'Id')}', res.data.id);`,
  ];
}

function extraEvents(req) {
  const p = `${req.method} ${req.fullPath}`;
  if (p === 'POST auth/admin/login') return loginTestScript('admin');
  if (['POST auth/verify-otp', 'POST auth/guest-login', 'POST auth/kwikpass/exchange', 'POST auth/refresh'].includes(p)) {
    return loginTestScript('customer');
  }
  if (req.method === 'POST' && /\/?[^/]+$/.test(req.fullPath) && !req.fullPath.includes(':')) {
    const last = req.fullPath.split('/').filter(Boolean).pop() || '';
    const map = {
      products: 'productRefId',
      'bundle-products': 'bundleRefId',
      brands: 'brandRefId',
      categories: 'categoryRefId',
      coupons: 'couponRefId',
      plans: 'planRefId',
    };
    if (map[last]) return refIdScript(map[last]);
  }
  return null;
}

const NAME_OVERRIDES = {
  'POST auth/admin/login': 'Admin Login',
  'POST auth/admin/logout': 'Admin Logout',
  'GET auth/admin/me': 'Admin Me',
  'GET auth/admin/menu': 'Admin Menu',
  'POST auth/login': 'Send Login OTP',
  'POST auth/send-otp': 'Send OTP',
  'POST auth/verify-otp': 'Verify OTP',
  'POST auth/guest-login': 'Guest Login',
  'POST auth/complete-registration': 'Complete Registration',
  'GET auth/me': 'Current User',
  'POST auth/refresh': 'Refresh Session',
  'POST auth/logout': 'Logout',
  'POST auth/logout-all': 'Logout All Devices',
  'GET auth/sessions': 'List Sessions',
  'POST auth/sessions/:sessionId/revoke': 'Revoke Session',
  'GET auth/kwikpass/config': 'KwikPass Config',
  'POST auth/kwikpass/exchange': 'KwikPass Exchange',
  'POST auth/kwikpass/probe': 'KwikPass Probe',
  'GET health': 'Health Check',
  'GET health/redis': 'Redis Health',
};

const BODY_OVERRIDES = {
  'POST products': {
    name: 'Volini Pain Relief Gel 30g',
    slug: 'volini-pain-relief-gel-30g',
    productType: 'simple',
    categoryRefId: '{{categoryRefId}}',
    brandRefId: '{{brandRefId}}',
    tagNames: ['New Launch'],
    highlights: 'Fast pain relief',
    description: 'Topical pain relief gel for muscles and joints',
    returnAllowed: false,
    subscriptionEnabled: false,
    codAvailable: true,
    variants: [{ sku: 'VOL001', mrp: 120, sellingPrice: 99, stock: 500 }],
    media: [
      { type: 'image', url: '/uploads/images/volini-thumb.jpg', sortOrder: 0, isPrimary: true },
    ],
  },
};

function buildItem(req, dtos, enums) {
  const segments = pathToPostman(req.fullPath);
  const query = [];

  if (req.queryDto) {
    query.push(...buildQueryParams(req.queryDto, dtos, enums));
  }
  for (const q of req.namedQueries) {
    if (!query.some((x) => x.key === q)) {
      query.push({
        key: q,
        value: q === 'page' ? '1' : q === 'limit' ? '20' : '',
        disabled: !['page', 'limit'].includes(q),
      });
    }
  }
  for (const q of req.apiQueries) {
    if (!query.some((x) => x.key === q.name)) {
      query.push({
        key: q.name,
        value: '',
        disabled: !q.required,
        description: q.desc,
      });
    }
  }

  const rawPath = segments.join('/');
  const rawQuery = query
    .filter((q) => !q.disabled)
    .map((q) => `${q.key}=${q.value}`)
    .join('&');
  const rawUrl = rawQuery ? `{{baseUrl}}/${rawPath}?${rawQuery}` : `{{baseUrl}}/${rawPath}`;

  const item = {
    name: `${req.method} /${humanizePath(req.fullPath)}`.replace(/\/$/, ''),
    request: {
      method: req.method,
      header: [],
      url: {
        raw: rawUrl,
        host: ['{{baseUrl}}'],
        path: segments,
        ...(query.length ? { query } : {}),
      },
      description: [req.name, req.description, `Auth: ${req.auth}`].filter(Boolean).join('\n\n'),
    },
  };

  const auth = requestAuth(req.auth);
  if (auth) item.request.auth = auth;

  const overrideKey = `${req.method} ${req.fullPath}`;
  if (req.isMultipart) {
    item.request.body = {
      mode: 'formdata',
      formdata: [
        { key: 'file', type: 'file', src: [], description: 'Select a file to upload' },
        { key: 'files', type: 'file', src: [], disabled: true, description: 'Some endpoints accept multiple files' },
      ],
    };
  } else if (BODY_OVERRIDES[overrideKey]) {
    item.request.header.push({ key: 'Content-Type', value: 'application/json' });
    item.request.body = {
      mode: 'raw',
      raw: JSON.stringify(BODY_OVERRIDES[overrideKey], null, 2),
      options: { raw: { language: 'json' } },
    };
  } else if (req.bodyDto) {
    let body = buildBody(req.bodyDto, dtos, enums);
    if (req.bodyIsArray) body = [body];
    if (body && (Array.isArray(body) || Object.keys(body).length)) {
      item.request.header.push({ key: 'Content-Type', value: 'application/json' });
      item.request.body = {
        mode: 'raw',
        raw: JSON.stringify(body, null, 2),
        options: { raw: { language: 'json' } },
      };
    }
  } else if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.isMultipart) {
    item.request.header.push({ key: 'Content-Type', value: 'application/json' });
    item.request.body = {
      mode: 'raw',
      raw: '{}',
      options: { raw: { language: 'json' } },
    };
  }

  const script = extraEvents(req);
  if (script) {
    item.event = [
      {
        listen: 'test',
        script: { type: 'text/javascript', exec: script },
      },
    ];
  }

  const overrideName = NAME_OVERRIDES[`${req.method} ${req.fullPath}`];
  if (overrideName) item.name = overrideName;
  else if (req.name && req.name !== item.name) item.name = req.name;

  return item;
}

const FOLDER_ORDER = [
  'Health',
  'Auth',
  'Public Storefront',
  'Customer',
  'Admin',
  'GoKwik',
  'Webhooks & Integrations',
  'Other',
];

function sortFolderItems(nodes) {
  const methodRank = { GET: 1, POST: 2, PUT: 3, PATCH: 4, DELETE: 5 };
  nodes.sort((a, b) => {
    const aFolder = Boolean(a.item);
    const bFolder = Boolean(b.item);
    if (aFolder !== bFolder) return aFolder ? -1 : 1;
    if (aFolder) return a.name.localeCompare(b.name);
    const aParam = (a.request?.url?.raw || '').includes('{{');
    const bParam = (b.request?.url?.raw || '').includes('{{');
    if (aParam !== bParam) return aParam ? 1 : -1;
    const am = methodRank[a.request?.method] || 9;
    const bm = methodRank[b.request?.method] || 9;
    if (am !== bm) return am - bm;
    return a.name.localeCompare(b.name);
  });
  for (const n of nodes) {
    if (n.item) sortFolderItems(n.item);
  }
}

function nestFolders(items) {
  const root = [];
  const map = new Map();

  function ensure(parts) {
    const key = parts.join(' / ');
    if (map.has(key)) return map.get(key);
    const node = { name: parts[parts.length - 1], item: [] };
    map.set(key, node);
    if (parts.length === 1) root.push(node);
    else ensure(parts.slice(0, -1)).item.push(node);
    return node;
  }

  for (const { folder, item } of items) {
    ensure(folder).item.push(item);
  }
  sortFolderItems(root);
  root.sort((a, b) => {
    const ai = FOLDER_ORDER.indexOf(a.name);
    const bi = FOLDER_ORDER.indexOf(b.name);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return root;
}

function collectVariables(requests) {
  const keys = new Set([
    'baseUrl',
    'accessToken',
    'userSessionToken',
    'userId',
    'sessionId',
    'productRefId',
    'productId',
    'productVariantId',
    'variantId',
    'bundleRefId',
    'categoryRefId',
    'brandRefId',
    'couponRefId',
    'planRefId',
    'planId',
    'addressId',
    'cartItemId',
    'orderId',
    'subscriptionId',
    'benefitId',
    'id',
    'idOrRefId',
    'refId',
    'refIdOrId',
    'slug',
    'shopPath',
    'settingKey',
    'folder',
    'itemId',
    'productId',
  ]);
  for (const req of requests) {
    for (const p of req.pathParams) keys.add(p);
  }
  const defaults = {
    baseUrl: 'http://localhost:3000/api/v1',
    accessToken: '',
    userSessionToken: '',
    folder: 'images',
    shopPath: 'health/supplements',
    slug: 'sample-slug',
  };
  return [...keys].map((key) => ({
    key,
    value: defaults[key] ?? '',
  }));
}

function main() {
  const enums = parseEnums();
  const dtos = parseDtos(enums);
  const controllerFiles = collectFiles(
    ['.controller.ts'],
    [path.join(ROOT, 'modules'), path.join(ROOT, 'apps')],
  );

  const requests = [];
  for (const file of controllerFiles) {
    requests.push(...parseControllerFile(file));
  }

  const seen = new Set();
  const unique = [];
  for (const req of requests) {
    const key = `${req.method} ${req.fullPath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(req);
  }
  unique.sort((a, b) => a.fullPath.localeCompare(b.fullPath) || a.method.localeCompare(b.method));

  const foldered = unique.map((req) => ({
    folder: folderFor(req),
    item: buildItem(req, dtos, enums),
  }));

  const collection = {
    info: {
      _postman_id: 'cureka-api-all',
      name: 'Cureka API',
      description: [
        'Complete Cureka backend collection generated from current NestJS controllers.',
        '',
        '**Base URL:** `{{baseUrl}}` (default `http://localhost:3000/api/v1`)',
        '',
        '**Auth**',
        '- Admin APIs: run **Auth → Admin → Login**. Saves `accessToken` (also sent as `admin_token` cookie).',
        '- Customer APIs: run **Auth → Customer → Verify OTP** or **Guest Login**. Saves `userSessionToken`.',
        '- Public / webhook APIs: no auth.',
        '- Customer clients may use HttpOnly `user_session` cookie **or** `Authorization: Bearer {{userSessionToken}}`.',
        '',
        '**Response envelope:** `{ success, data, message, timestamp }`',
        '',
        `Generated ${new Date().toISOString().slice(0, 10)} from ${unique.length} routes.`,
      ].join('\n'),
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: {
      type: 'bearer',
      bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }],
    },
    variable: collectVariables(unique),
    item: nestFolders(foldered),
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(collection, null, 2));
  console.log(`Wrote ${unique.length} requests → ${path.relative(ROOT, OUT_FILE)}`);
}

main();
