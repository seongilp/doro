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

/** 지도에 그릴 수 있는 콘존 구간 */
export interface ConzoneSegment {
  readonly id: string;
  readonly name: string;
  readonly routeNo: string;
  readonly routeName: string;
  readonly direction: 'S' | 'E';
  readonly speed: number;
  readonly traffic: number;
  readonly grade: number;
  readonly path: readonly LatLng[];
}

export interface TrafficSnapshot {
  readonly updatedAt: string;
  readonly stdDate: string;
  readonly stdHour: string;
  readonly segments: readonly ConzoneSegment[];
  readonly routes: readonly string[];
}

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
