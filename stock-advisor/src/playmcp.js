import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// 출처 가이드 기준 기본 주소. PlayMCP 도구함 화면에 다른 주소가 안내되면 PLAYMCP_URL로 덮어쓰세요.
const DEFAULT_URL = 'https://playmcp.kakao.com/mcp';
const SELF_CHAT = /나와의\s*채팅|나에게|나한테|memo|self/i;
const TEXT_KEYS = ['text', 'message', 'content', 'body', 'msg', '메시지'];

export async function connect({ url = process.env.PLAYMCP_URL || DEFAULT_URL, token = process.env.PLAYMCP_TOKEN } = {}) {
  if (!token) {
    throw new Error('PLAYMCP_TOKEN 이 없습니다. README의 "PlayMCP 인증" 단계를 먼저 진행하세요.');
  }
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: 'stock-advisor', version: '0.1.0' });
  await client.connect(transport);
  return client;
}

export async function listTools(client) {
  const { tools } = await client.listTools();
  return tools;
}

// 도구 이름이 확실하지 않으므로 PLAYMCP_TOOL 로 지정하거나, 없으면 설명으로 "나와의 채팅방" 도구를 추정한다.
export function pickSelfChatTool(tools, forced = process.env.PLAYMCP_TOOL) {
  if (forced) {
    const t = tools.find((x) => x.name === forced);
    if (!t) throw new Error(`PLAYMCP_TOOL=${forced} 도구를 찾을 수 없습니다. "npm run tools"로 목록을 확인하세요.`);
    return t;
  }
  const hit = tools.filter((t) => SELF_CHAT.test(`${t.name} ${t.description ?? ''}`));
  if (hit.length !== 1) {
    throw new Error(
      `"나와의 채팅방" 도구를 자동으로 고르지 못했습니다(후보 ${hit.length}개). ` +
        '"npm run tools"로 이름을 확인한 뒤 PLAYMCP_TOOL 환경변수로 지정하세요.',
    );
  }
  return hit[0];
}

export function buildArgs(tool, text) {
  const props = tool.inputSchema?.properties ?? {};
  const key =
    TEXT_KEYS.find((k) => k in props) ??
    Object.keys(props).find((k) => props[k].type === 'string' && (tool.inputSchema.required ?? []).includes(k));
  if (!key) throw new Error(`${tool.name}: 본문을 넣을 문자열 파라미터를 찾지 못했습니다. 스키마: ${JSON.stringify(props)}`);
  return { [key]: text };
}

export async function sendToKakao(client, text) {
  const tool = pickSelfChatTool(await listTools(client));
  const res = await client.callTool({ name: tool.name, arguments: buildArgs(tool, text) });
  if (res.isError) throw new Error(`카카오톡 전송 실패: ${JSON.stringify(res.content)}`);
  return res;
}
