namespace CSharpFileRenamer.Core
{
    public interface IRenameRule
    {
        string Name { get; }
        string Description { get; }
        TargetScope Scope { get; }
        string Apply(string input, FileContext context);
    }
}
