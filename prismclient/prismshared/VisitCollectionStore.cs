namespace prismshared;

internal sealed class VisitCollectionState
{
    public bool? HistoryCollection { get; set; }

    public Dictionary<string, long> Watermarks { get; set; } = new(StringComparer.Ordinal);

    public List<VisitIngestItem> Pending { get; set; } = [];
}

internal static class VisitCollectionStore
{
    public static VisitCollectionState Load(string? path = null)
    {
        var state = AtomicJsonFileStore.Read<VisitCollectionState>(path ?? PrismPaths.VisitCollectionPath)
            ?? new VisitCollectionState();
        state.Watermarks ??= new Dictionary<string, long>(StringComparer.Ordinal);
        state.Pending ??= [];
        return state;
    }

    public static void Save(VisitCollectionState state, string? path = null)
    {
        AtomicJsonFileStore.Write(path ?? PrismPaths.VisitCollectionPath, state);
    }
}
