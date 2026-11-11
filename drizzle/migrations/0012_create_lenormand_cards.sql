CREATE TABLE public.lenormand_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_number integer NOT NULL UNIQUE CHECK (card_number BETWEEN 1 AND 36),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  keywords text[] NOT NULL DEFAULT '{}',
  core_meaning text,
  positive_meaning text,
  challenging_meaning text,
  love_meaning text,
  work_meaning text,
  money_meaning text,
  family_meaning text,
  spirituality_meaning text,
  prediction_meaning text,
  position_meanings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(position_meanings) = 'object'),
  content_status text NOT NULL DEFAULT 'pendente' CHECK (content_status IN ('pendente','em_andamento','completa')),
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.lenormand_cards TO authenticated;
GRANT ALL ON public.lenormand_cards TO service_role;
ALTER TABLE public.lenormand_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read cards" ON public.lenormand_cards FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update cards" ON public.lenormand_cards FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.lenormand_cards_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  pos text[] := ARRAY['passado_raiz','raiz_da_questao','passado_recente','situacao_atual','momento_presente','o_que_esta_oculto','influencia_oculta','desafio','tendencia','conselho','desfecho'];
  texts text[];
  filled int := 0; total int; p text; t text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.card_number := OLD.card_number; NEW.name := OLD.name; NEW.slug := OLD.slug; NEW.created_at := OLD.created_at;
  END IF;
  texts := ARRAY[NEW.core_meaning,NEW.positive_meaning,NEW.challenging_meaning,NEW.love_meaning,NEW.work_meaning,NEW.money_meaning,NEW.family_meaning,NEW.spirituality_meaning,NEW.prediction_meaning];
  FOREACH p IN ARRAY pos LOOP texts := texts || (NEW.position_meanings->>p); END LOOP;
  total := array_length(texts,1) + 1;
  FOREACH t IN ARRAY texts LOOP IF t IS NOT NULL AND length(btrim(t)) > 0 THEN filled := filled + 1; END IF; END LOOP;
  IF coalesce(array_length(array_remove(NEW.keywords,''),1),0) > 0 THEN filled := filled + 1; END IF;
  NEW.content_status := CASE WHEN filled = 0 THEN 'pendente' WHEN filled = total THEN 'completa' ELSE 'em_andamento' END;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER lenormand_cards_before_write BEFORE INSERT OR UPDATE ON public.lenormand_cards FOR EACH ROW EXECUTE FUNCTION public.lenormand_cards_before_write();

INSERT INTO public.lenormand_cards (card_number, name, slug) VALUES
(1,'O Cavaleiro','o-cavaleiro'),(2,'O Trevo','o-trevo'),(3,'O Navio','o-navio'),(4,'A Casa','a-casa'),(5,'A Árvore','a-arvore'),(6,'As Nuvens','as-nuvens'),
(7,'A Cobra','a-cobra'),(8,'O Caixão','o-caixao'),(9,'O Buquê','o-buque'),(10,'A Foice','a-foice'),(11,'O Chicote','o-chicote'),(12,'Os Pássaros','os-passaros'),
(13,'A Criança','a-crianca'),(14,'A Raposa','a-raposa'),(15,'O Urso','o-urso'),(16,'A Estrela','a-estrela'),(17,'A Cegonha','a-cegonha'),(18,'O Cachorro','o-cachorro'),
(19,'A Torre','a-torre'),(20,'O Jardim','o-jardim'),(21,'A Montanha','a-montanha'),(22,'Os Caminhos','os-caminhos'),(23,'O Rato','o-rato'),(24,'O Coração','o-coracao'),
(25,'O Anel','o-anel'),(26,'O Livro','o-livro'),(27,'A Carta','a-carta'),(28,'O Cigano','o-cigano'),(29,'A Cigana','a-cigana'),(30,'Os Lírios','os-lirios'),
(31,'O Sol','o-sol'),(32,'A Lua','a-lua'),(33,'A Chave','a-chave'),(34,'Os Peixes','os-peixes'),(35,'A Âncora','a-ancora'),(36,'A Cruz','a-cruz');