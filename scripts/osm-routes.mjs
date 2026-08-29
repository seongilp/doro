/** 도로공사 노선명 → OpenStreetMap 고속도로 이름 매핑. */

/**
 * 이름 규칙("경부선" → "경부고속도로")으로 풀리지 않는 노선의 수동 대응표.
 * 도로공사가 구간별로 쪼개 부르는 노선을 OSM의 통합 노선명으로 보낸다.
 */
export const ROUTE_NAME_OVERRIDES = Object.freeze({
  '서울문산선': '수원문산고속도로',
  '서울문산지선': '수원문산고속도로',
  '청주영덕선': '서산영덕고속도로',
  '당진대전선': '서산영덕고속도로',
  '부산울산선': '부산포항고속도로',
  '동해선(부산-포항)': '부산포항고속도로',
  '동해선(포항-영덕)': '동해고속도로',
  '남해1지선': '남해고속도로제1지선',
  '남해2지선': '남해고속도로제2지선',
  '인천대교지선': '인천대교고속도로',
  '인천공항선': '인천국제공항고속도로',
  '익산평택지선': '익산평택고속도로지선',
  '호남지선': '호남고속도로지선',
  '대전남부선': '대전남부순환고속도로',
  '봉담동탄선': '수도권제2순환고속도로',
  '인천김포선': '수도권제2순환고속도로',
  '봉담송산선': '수도권제2순환고속도로',
  '화성광주선': '수도권제2순환고속도로',
  '중부내륙지선': '중부내륙고속도로지선',
  '중앙선지선': '중앙고속도로지선',
  '부산외곽선': '부산외곽순환고속도로',
  // 고속도로가 아니라 지하도로다. OSM 이름이 노선명과 같다.
  '신월여의지하도로': '신월여의지하도로',
});

/** "남해선(순천-부산)" → "남해고속도로" */
export function osmNameForRoute(routeName) {
  const override = ROUTE_NAME_OVERRIDES[routeName];
  if (override) return override;
  const base = routeName.replace(/\(.*\)/, '').replace(/선$/, '');
  return `${base}고속도로`;
}

/**
 * 노선 하나가 OSM에서는 여러 이름으로 나뉘어 있을 수 있다.
 * 예) 중앙선의 부산 구간은 "중앙고속도로"가 아니라 "중앙고속도로지선"이다.
 * 기본 이름으로 시작하는 OSM 이름을 모두 후보로 삼는다.
 */
export function osmNamesForRoute(routeName, availableNames) {
  const primary = osmNameForRoute(routeName);
  const matched = availableNames.filter((name) => name.startsWith(primary));
  return matched.length > 0 ? matched : [];
}
