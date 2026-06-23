# Grafana Service Monitor Card

Painel de monitoramento de serviços Windows via **Grafana HTML Graphics** + **Zabbix**, exibindo status em tempo real com histórico de 24h por item.

---
<img width="1818" height="822" alt="image" src="https://github.com/user-attachments/assets/6dcf4230-c54d-41bc-ab2f-01678b031912" />

## Stack

| Componente | Função |
|---|---|
| Grafana | Plataforma de visualização |
| [HTML Graphics Plugin](https://github.com/volkovlabs/volkovlabs-html-panel) | Renderiza HTML/CSS/JS customizado no painel |
| Zabbix | Fonte dos dados via `service.info[x,state]` |
| MySQL / PostgreSQL | Backend do Grafana com dados do Zabbix |

---

## Estrutura de arquivos

```
├── panel.html   # Estrutura HTML do card
├── panel.css    # Estilos (dark/light theme automático)
└── panel.js     # Lógica de renderização e eventos
```

---

## Fonte de dados esperada

### series[0] - Status atual

| Coluna | Tipo | Descrição |
|---|---|---|
| `Servidor` | string | Nome do host |
| `Item` | string | Nome do item Zabbix |
| `Status` | number | Estado do serviço (ver tabela abaixo) |
| `ItemId` | string | ID do item para correlação com histórico |

### series[1] - Histórico 24h

| Coluna | Tipo | Descrição |
|---|---|---|
| `ItemId` | string | ID do item |
| `Clock` | timestamp | Epoch em segundos ou ms |
| `Value` | number | Estado no instante |

### Mapeamento de estados (`service.info[x,state]`)

| Valor | Label |
|---|---|
| `0` | Running |
| `1` | Paused |
| `2` | Start Pending |
| `3` | Pause Pending |
| `4` | Continue Pending |
| `5` | Stop Pending |
| `6` | Stopped |
| `7` | Unknown |

---

## Funcionalidades

- **Totalizador** - Running / Stopped / Total no topo do painel
- **Filtro** - busca por servidor ou serviço em tempo real
- **Ordenação** - por Nome, Status ou Serviço
- **Badge de status** - faixa lateral colorida + badge textual por card
- **Modal de histórico** - gráfico step chart das últimas 24h com:
  - Número de quedas
  - Tempo total parado
  - Disponibilidade em %
- **Tema automático** - detecta dark/light do Grafana via `htmlGraphics.theme.isDark`
- **Estado persistente** - filtro e ordenação sobrevivem a re-renders via `window.__sc_svc_state__`

---

## Mapeamento de colunas flexível

O painel aceita variações de nome de coluna. Aliases configurados em `COL_MAP` dentro de `panel.js`:

```js
const COL_MAP = {
  Servidor: ['servidor', 'host', 'h.name', 'hostname', 'name'],
  Item:     ['item', 'i.name', 'nome', 'itemname', 'item_name', 'description'],
  Status:   ['status', 'statusservico', 'value', 'estado', 'state'],
  ItemId:   ['itemid', 'item_id', 'i.itemid', 'id'],
  Clock:    ['clock', 'time', 'timestamp', 'datetime'],
  Value:    ['value', 'val', 'estado', 'state'],
};
```

---

## Anonimização (demo/repositório público)

Os nomes reais de hosts e serviços são substituídos no momento da renderização, sem alterar os dados originais:

```js
const srv  = `SRV-LNX-${String(i + 1).padStart(2, '0')}`;
const item = `Service-${String(i + 1).padStart(2, '0')}`;
```

Para usar os dados reais, remova essas duas linhas e restaure:

```js
const srv  = asStr(row.Servidor).replace(/[<>]/g, '');
const item = asStr(row.Item)
  .replace(/[<>]/g, '')
  .replace(/^State of service\s*/i, '')
  .trim();
```

---

## Instalação no Grafana

1. Instale o plugin **HTML Graphics** no Grafana.
2. Crie um painel do tipo **HTML Graphics**.
3. Cole o conteúdo de `panel.html` no campo **HTML**.
4. Cole o conteúdo de `panel.css` no campo **CSS**.
5. Cole o conteúdo de `panel.js` no campo **onRender**.
6. Configure duas queries na fonte de dados:
   - `series[0]` → status atual dos serviços
   - `series[1]` → histórico de valores das últimas 24h

---

## Preview

> Dark mode com dados anonimizados.

![preview](preview.png)
