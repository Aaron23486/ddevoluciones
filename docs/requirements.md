# Requirements

This document describes what Devoluciones does today. Identifiers are stable so code, tests and decisions can refer to them.

## Context

A distribution center receives merchandise returned by carriers. Heavy goods (_Pesado_) are delivered physically and checked against a signed invoice before inventory; warehouse goods (_Almacén_) go straight to inventory. Inventory separates good material, which is located in the warehouse, from damaged material, which gets a final disposal. Separately, loads that could not be delivered come back to the dock and must be dispatched again. Every step needs photo evidence and a trace of who did it.

## Actors

| Role           | Description                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `admin`        | Every module and stage, user administration, deletion of returns and voiding of load reports.  |
| `devoluciones` | Registers returns; sees every return and the executive dashboard.                              |
| `pesado`       | Receives and locates returns of the Pesado flow; sees only that flow.                          |
| `inventario`   | Processes inventory and disposes of damaged material; registers and redispatches load reports. |
| `almacen`      | Locates good material of the Almacén flow; sees only that flow.                                |
| `transportes`  | Registers returned loads; sees only load reports.                                              |
| `seguridad`    | Registers returned loads; sees only load reports.                                              |

Accounts are provisioned from the terminal; there is no public sign-up or access-request flow.

## Functional requirements

| ID    | Requirement                                                                                                                                                                       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1  | Users sign in with email and password. Accounts without a profile, with an inactive profile or with an unknown role are rejected with a generic message.                          |
| FR-2  | Every page except `/login` requires a session and an active profile; each page is limited to the roles in the route access map, checked on the server.                            |
| FR-3  | `admin` and `devoluciones` register a return with invoice, item, quantity, classification (good, damaged, mixed), flow, carrier, carrier ID, plate, description and two photos.   |
| FR-4  | A Pesado return starts in `pendiente_entrega`; `pesado` confirms the physical reception with the received quantity, classification, signed invoice and material photos.           |
| FR-5  | `inventario` processes a received Pesado return or a new Almacén return with a pallet code and evidence, creating one material line per type (good, damaged).                     |
| FR-6  | Good material is located by `pesado` (Pesado flow) or `almacen` (Almacén flow); damaged material is disposed of by `inventario` with a final decision and evidence.               |
| FR-7  | A return closes when all its material lines are closed; its state reflects the pending work of its lines.                                                                         |
| FR-8  | Every case shows its general data, material lines, evidence and history of transitions.                                                                                           |
| FR-9  | `admin` deletes a return; the deletion keeps a full snapshot of the return, its lines, evidence and history.                                                                      |
| FR-10 | `admin`, `inventario`, `transportes` and `seguridad` register a returned load with customer, item, quantity, reason, physical state and evidence; it waits for redispatch.        |
| FR-11 | `admin` and `inventario` record the redispatch of a load with driver, plate, notes and evidence; `admin` voids a load report, which hides it without deleting its history.        |
| FR-12 | Lists of returns and load reports are filtered by text, state, material, flow and dates, paginated, and summarized by state.                                                      |
| FR-13 | Users receive notifications for their role or for themselves and can mark them as read or clear their personal inbox.                                                             |
| FR-14 | `admin` and `devoluciones` see an executive dashboard for 7, 30 or 90 days or a custom range, compared with the previous period, with cross-filtering and drill-down to the list. |
| FR-15 | `pesado`, `inventario` and `almacen` see a dashboard with their own work queues.                                                                                                  |
| FR-16 | `admin` changes the role and active status of accounts from the Users page.                                                                                                       |
| FR-17 | Accounts are created, activated, deactivated, re-roled and have their password reset from the terminal (`npm run users`).                                                         |
| FR-18 | `npm run demo:setup` prepares a local evaluation with one account per role, generated passwords and fictional data in every stage.                                                |

## Business rules

| ID  | Rule                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-1 | A Pesado return is received only once, only from `pendiente_entrega`; concurrent receptions accept exactly one.                                        |
| R-2 | For mixed material, good plus damaged quantities equal the received quantity, and both are positive.                                                   |
| R-3 | Good material can only be located; damaged material can only be disposed of.                                                                           |
| R-4 | Pesado and Almacén roles act only on returns of their own flow.                                                                                        |
| R-5 | Evidence attached to a case is an existing file uploaded by the acting user to their own folder and module area; it cannot be deleted by its uploader. |
| R-6 | A load report waits for redispatch until `inventario` or `admin` records it; voided reports are hidden from every list.                                |
| R-7 | At least one active administrator always exists.                                                                                                       |
| R-8 | New Auth identities start inactive with the least privileged role; client metadata never grants a role.                                                |
| R-9 | Passwords change only through the terminal function, which also closes the account's sessions.                                                         |

## Non-functional requirements

| ID    | Requirement                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ |
| NFR-1 | Authorization and business rules are enforced by PostgreSQL (RLS, RPCs, constraints, triggers), not only by the UI.            |
| NFR-2 | The browser never receives database credentials beyond the session cookie, which is `httpOnly`.                                |
| NFR-3 | Each response carries a Content Security Policy with a per-request nonce and no inline scripts.                                |
| NFR-4 | Sessions last at most 12 hours and end after 4 hours of inactivity.                                                            |
| NFR-5 | Evidence is private: JPEG, PNG or WebP up to 5 MB, checked by declared type and file signature.                                |
| NFR-6 | Anyone can run the project locally with Docker and the documented commands, without the author's hosted project.               |
| NFR-7 | Pages meet WCAG 2.1 A/AA as checked by axe.                                                                                    |
| NFR-8 | Unit tests cover at least 85% of the logic modules; flows and permissions are tested against a real database and in a browser. |
| NFR-9 | Free-text inputs are bounded in the application and again in the database.                                                     |
