--
-- PostgreSQL database dump
--

\restrict iCgy990w2RazOCI6mSo6DWRqSw7mkmMU26XEHKmpCcoyVQb6CMEykpFVQPfpK6n

-- Dumped from database version 17.11 (Debian 17.11-1.pgdg13+2)
-- Dumped by pg_dump version 17.11 (Debian 17.11-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: requests; Type: TABLE; Schema: public; Owner: workflow
--

CREATE TABLE public.requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(120) NOT NULL,
    description text,
    status character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.requests OWNER TO workflow;

--
-- Data for Name: requests; Type: TABLE DATA; Schema: public; Owner: workflow
--

COPY public.requests (id, title, description, status, created_at, updated_at) FROM stdin;
4fb741b4-aa9a-4b69-bc66-72c1bb52cffd	测试工单1	学习数据库操作1	DRAFT	2026-10-24 09:36:19.814326+00	2026-10-24 09:36:19.814326+00
9fa8cb6d-71f5-4962-bd29-b38c1f432114	测试工单222	学习数据库操作222	DRAFT	2026-10-24 09:36:28.211502+00	2026-10-24 09:36:28.211502+00
d8a1d535-df57-498f-9888-c709d658b362	测试工单333	学习数据库操作333	DRAFT	2026-10-24 09:36:36.657296+00	2026-10-24 09:36:36.657296+00
6cb8fffe-202d-4d6a-b1b3-7cc264d59d81	采购申请	申请办公用品	DRAFT	2026-10-25 06:44:59.373408+00	2026-10-25 06:44:59.373408+00
7ea5fbb7-bbbc-41d0-aad6-0085402908c5	标题自测	标题自测描述	DRAFT	2026-10-25 07:06:00.068237+00	2026-10-25 07:06:00.068237+00
1aa89e10-7b80-4067-b892-b6849284acbb	标题自测1		DRAFT	2026-10-25 07:06:08.697459+00	2026-10-25 07:06:08.697459+00
\.


--
-- Name: requests requests_pkey; Type: CONSTRAINT; Schema: public; Owner: workflow
--

ALTER TABLE ONLY public.requests
    ADD CONSTRAINT requests_pkey PRIMARY KEY (id);


--
-- PostgreSQL database dump complete
--

\unrestrict iCgy990w2RazOCI6mSo6DWRqSw7mkmMU26XEHKmpCcoyVQb6CMEykpFVQPfpK6n

