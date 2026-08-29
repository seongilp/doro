import Dashboard from '@/components/Dashboard';
import { getTrafficSnapshot, getTrafficSummary } from '@/lib/traffic-service';
import type { TrafficSnapshot, TrafficSummary } from '@/lib/types';

/**
 * 첫 스냅숏을 HTML에 실어 보낸다.
 * 클라이언트가 마운트된 뒤에야 559KB를 받기 시작하면 빈 지도가 몇 초간 보인다.
 */
// Next.js는 이 값이 리터럴이어야 인식한다. TRAFFIC_REVALIDATE_SECONDS와 같은 값을 쓴다.
export const revalidate = 60;

async function loadOrNull<T>(load: () => Promise<T>, label: string): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    console.error(`[live/${label}]`, error);
    return null;
  }
}

export default async function LivePage() {
  const [snapshot, summary] = await Promise.all([
    loadOrNull<TrafficSnapshot>(getTrafficSnapshot, 'traffic'),
    loadOrNull<TrafficSummary>(getTrafficSummary, 'summary'),
  ]);

  return <Dashboard initialSnapshot={snapshot} initialSummary={summary} />;
}
