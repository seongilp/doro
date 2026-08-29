import Link from 'next/link';
import { getLandingStats } from '@/lib/landing-stats';
import { LEVELS } from '@/lib/traffic-style';

export const revalidate = 300;

const FEATURES = [
  {
    title: '전국 고속도로 실시간 지도',
    body: '1,000개가 넘는 콘존(구간)의 평균 속도를 OpenStreetMap 위에 색으로 그립니다. 정체 구간은 굵고 붉게 강조됩니다.',
  },
  {
    title: '노선·방향·혼잡도 필터',
    body: '경부선 상행만, 정체 구간만 보는 식으로 조합해 걸러 봅니다. 이름으로 구간을 검색할 수도 있습니다.',
  },
  {
    title: '정체 순위와 통행량 집계',
    body: '가장 느린 구간을 순위로 세우고, 전국 시간당 통행량을 수납 방식·운영 주체·차종별로 나눠 보여줍니다.',
  },
  {
    title: '1분마다 자동 갱신',
    body: 'VDS 관측 주기에 맞춰 1분마다 새로 불러옵니다. 자동 갱신을 끄고 원하는 순간에만 새로고침할 수도 있습니다.',
  },
] as const;

const PIPELINE = [
  {
    step: '01',
    title: '실시간 소통정보 수집',
    body: '한국도로공사 odtraffic API에서 콘존별 속도·교통량을 가져옵니다.',
  },
  {
    step: '02',
    title: '도로 선형 확보',
    body: 'OpenStreetMap에서 전국 고속도로 way를 받아 노선별 폴리라인으로 이어 붙입니다.',
  },
  {
    step: '03',
    title: '앵커 스냅',
    body: '영업소·IC·분기점 위치를 도로 위에 스냅하고, 차로가 번갈아 잡히지 않도록 콘존마다 일관되게 배정합니다.',
  },
  {
    step: '04',
    title: '구간 절단',
    body: '두 앵커 사이의 도로 조각을 잘라 콘존 경로로 씁니다. 전체 콘존의 94%가 실제 도로 선형을 따릅니다.',
  },
] as const;

function StatCard({
  value,
  label,
  tone,
}: {
  readonly value: string;
  readonly label: string;
  readonly tone?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4 backdrop-blur">
      <p className={`text-2xl font-semibold tabular-nums ${tone ?? 'text-slate-100'}`}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
    </div>
  );
}

export default async function Landing() {
  const stats = await getLandingStats();
  const format = (n: number) => n.toLocaleString('ko-KR');

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="text-sm font-semibold tracking-tight">
          DORO<span className="text-sky-500">.</span>
        </span>
        <nav className="flex items-center gap-4 text-xs text-slate-400">
          <a href="#how" className="hover:text-slate-100">
            동작 방식
          </a>
          <a href="#data" className="hover:text-slate-100">
            데이터
          </a>
          <Link
            href="/live"
            className="rounded-md bg-sky-600 px-3 py-1.5 font-medium text-white transition hover:bg-sky-500"
          >
            지도 열기
          </Link>
        </nav>
      </header>

      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 h-96 bg-[radial-gradient(ellipse_at_center,rgba(14,165,233,0.22),transparent_65%)]"
        />
        <div className="relative mx-auto max-w-5xl px-6 pb-16 pt-10 sm:pt-16">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-[11px] text-slate-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sky-500" />
            </span>
            한국도로공사 공공데이터 · 1분 주기 갱신
          </p>

          <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            전국 고속도로가
            <br />
            지금 어떻게 흐르는지
            <span className="text-sky-500"> 한 화면에서</span>.
          </h1>

          <p className="mt-5 max-w-xl text-sm leading-relaxed text-slate-400">
            한국도로공사 실시간 소통정보를 OpenStreetMap 위에 구간별로 그립니다. 좌표가 없는
            원본 데이터를 실제 고속도로 선형에 스냅해, 전국 노선을 도로 모양 그대로 정체
            색상으로 읽을 수 있게 만들었습니다.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/live"
              className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-500"
            >
              실시간 지도 보기
            </Link>
            <a
              href="#how"
              className="rounded-lg border border-slate-700 px-5 py-2.5 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              어떻게 만들었나
            </a>
          </div>

          <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.available ? (
              <>
                <StatCard value={format(stats.segmentCount)} label="지도에 표시되는 구간" />
                <StatCard value={format(stats.routeCount)} label="노선 수" />
                <StatCard value={`${stats.avgSpeed} km/h`} label="전국 평균 속도" />
                <StatCard
                  value={format(stats.jamCount)}
                  label="정체 구간 (40km/h 미만)"
                  tone="text-red-400"
                />
              </>
            ) : (
              <div className="col-span-2 rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4 text-xs text-slate-500 sm:col-span-4">
                실시간 지표를 불러오지 못했습니다. 도로공사 API 응답을 기다리는 중입니다 — 지도는
                그대로 열 수 있습니다.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-14">
        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-slate-800 bg-slate-900/40 p-5"
            >
              <h2 className="text-sm font-semibold text-slate-100">{feature.title}</h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{feature.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <p className="mb-3 text-[11px] uppercase tracking-wide text-slate-500">
            소통 상태 색상
          </p>
          <ul className="flex flex-wrap gap-4">
            {LEVELS.map((level) => (
              <li key={level.level} className="flex items-center gap-2 text-xs text-slate-300">
                <span
                  className="h-1.5 w-8 rounded-full"
                  style={{ backgroundColor: level.color }}
                />
                {level.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-5xl px-6 py-14">
        <h2 className="text-xl font-semibold tracking-tight">데이터가 지도가 되기까지</h2>
        <p className="mt-2 max-w-xl text-sm text-slate-400">
          도로공사 실시간 소통정보에는 위경도가 없습니다. 콘존 이름을 OpenStreetMap 도로 선형
          위에 얹어 실제 형상을 복원하는 것이 이 프로젝트의 핵심입니다.
        </p>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PIPELINE.map((item) => (
            <li
              key={item.step}
              className="rounded-xl border border-slate-800 bg-slate-900/40 p-5"
            >
              <span className="font-mono text-xs text-sky-500">{item.step}</span>
              <h3 className="mt-2 text-sm font-semibold text-slate-100">{item.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{item.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="data" className="mx-auto max-w-5xl px-6 py-14">
        <h2 className="text-xl font-semibold tracking-tight">데이터 출처</h2>
        <ul className="mt-4 space-y-2 text-sm text-slate-400">
          <li>
            <span className="text-slate-200">실시간 소통정보</span> — 한국도로공사{' '}
            <code className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-xs text-slate-300">
              odtraffic/trafficAmountByRealtime
            </code>
          </li>
          <li>
            <span className="text-slate-200">전국 통행량 집계</span> — 한국도로공사{' '}
            <code className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-xs text-slate-300">
              trafficapi/trafficAll
            </code>
          </li>
          <li>
            <span className="text-slate-200">영업소·IC 좌표</span> — 한국도로공사{' '}
            <code className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-xs text-slate-300">
              locationinfo/locationinfoUnit
            </code>
          </li>
          <li>
            <span className="text-slate-200">도로 선형 · 배경 지도</span> — OpenStreetMap
            contributors (ODbL)
          </li>
        </ul>
        <p className="mt-6 text-xs text-slate-600">
          이 사이트는 공개 데이터를 시각화한 비공식 프로젝트이며, 실제 주행 판단의 근거로
          사용하지 마세요.
        </p>
      </section>

      <footer className="border-t border-slate-900 px-6 py-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between text-xs text-slate-600">
          <span>DORO — 전국 실시간 교통량</span>
          <Link href="/live" className="text-slate-400 hover:text-sky-400">
            지도 열기 →
          </Link>
        </div>
      </footer>
    </div>
  );
}
