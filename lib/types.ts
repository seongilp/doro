/** 한국도로공사 OpenAPI 응답 및 앱 내부 도메인 타입 */

export type LatLng = readonly [number, number];

/** locationinfo/locationinfoUnit: 영업소·IC 위치 */
export interface UnitLocation {
  readonly unitName: string;
  readonly unitCode: string;
  readonly routeNo: string;
  readonly routeName: string;
  readonly xValue: string;
  readonly yValue: string;
}

/** odtraffic/trafficAmountByRealtime: 콘존 단위 실시간 소통정보 */
export interface RawConzone {
  readonly routeName: string;
  readonly routeNo: string;
  readonly trafficAmout: string;
  readonly conzoneId: string;
  readonly conzoneName: string;
  readonly stdDate: string;
  readonly stdHour: string;
  readonly vdsId: string;
  readonly speed: string;
  readonly shareRatio: string;
  readonly timeAvg: string;
  readonly grade: string;
  readonly updownTypeCode: string;
}

/** trafficapi/trafficAll: 전국 통행량 집계 */
export interface RawTrafficAll {
  readonly exDivName: string;
  readonly tcsName: string;
  readonly carType: string;
  readonly trafficAmout: string;
  readonly sumTm: string;
  readonly sumDate: string;
}

/** 매분 바뀌는 값: [속도, 교통량, 혼잡등급] */
export type ConzoneValues = readonly [number, number, number];

/**
 * 화면에서 쓰는 콘존 하나의 상태.
 * 정적 정보(lib/conzone-index.ts)와 실시간 값(ConzoneValues)을 합친 결과다.
 */
export interface ConzoneStatus {
  readonly id: string;
  readonly name: string;
  readonly routeNo: string;
  readonly routeName: string;
  readonly direction: 'S' | 'E';
  readonly speed: number;
  readonly traffic: number;
  readonly grade: number;
}

/** 콘존 id → 도로 경로. `data/conzone-paths.json`에서 온다. */
export type ConzonePathMap = Readonly<Record<string, readonly LatLng[]>>;

export interface SummaryBucket {
  readonly label: string;
  readonly amount: number;
}

export interface TrafficSummary {
  readonly sumDate: string;
  readonly sumTm: string;
  readonly total: number;
  readonly byOperator: readonly SummaryBucket[];
  readonly byTcs: readonly SummaryBucket[];
  readonly byCarType: readonly SummaryBucket[];
}
