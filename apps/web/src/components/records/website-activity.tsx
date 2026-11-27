import { EntitySection } from "@crm/ui/patterns/entity-sheet";
import { useQuery } from "@tanstack/react-query";
import { relativeTime } from "../../lib/record-format.ts";
import { type ActivityKind, websiteActivityQuery } from "../../lib/tracking.ts";
import { DetailList, DetailRow, StaticDetail } from "./detail-fields.tsx";

/**
 * "Website activity" on a company's or contact's Overview: page views, sources and the top page
 * from the tracking snippet. Shows only once the record has visits.
 */
export function WebsiteActivity({
  userId,
  workspaceId,
  kind,
  id,
}: {
  userId: string;
  workspaceId: string;
  kind: ActivityKind;
  id: string;
}) {
  const { data: activity } = useQuery(websiteActivityQuery(userId, workspaceId, kind, id));

  if (!activity) return null;

  return (
    <EntitySection label="Website activity">
      <DetailList columns={2}>
        <DetailRow label="Page views">
          <StaticDetail>
            <span className="tabular-nums select-text">
              {activity.views.toLocaleString()}
              {` · last seen ${relativeTime(activity.last_seen_at) ?? ""}`}
            </span>
          </StaticDetail>
        </DetailRow>
        <DetailRow label="Original source">
          <StaticDetail>
            <span className="select-text">{activity.original_source}</span>
          </StaticDetail>
        </DetailRow>
        <DetailRow label="Top page">
          <StaticDetail>
            <span className="select-text" title={activity.top_page.path}>
              {activity.top_page.path}
              <span className="tabular-nums">{` · ${activity.top_page.views} views`}</span>
            </span>
          </StaticDetail>
        </DetailRow>
        <DetailRow label="Latest source">
          <StaticDetail>
            <span className="select-text">{activity.latest_source}</span>
          </StaticDetail>
        </DetailRow>
        <DetailRow label="First seen">
          <StaticDetail>{relativeTime(activity.first_seen_at)}</StaticDetail>
        </DetailRow>
        {activity.campaign ? (
          <DetailRow label="Campaign">
            <StaticDetail>
              <span className="select-text">{activity.campaign}</span>
            </StaticDetail>
          </DetailRow>
        ) : null}
      </DetailList>
    </EntitySection>
  );
}
