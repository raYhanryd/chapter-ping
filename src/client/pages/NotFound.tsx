import { Link } from "react-router-dom";
import { Page } from "../components/ui";

export function NotFound() {
  return (
    <Page title="Page not found" intro="That address does not lead to a page in Chapter Tracker.">
      <Link className="btn btn-secondary" to="/dashboard">
        Back to your series
      </Link>
    </Page>
  );
}
