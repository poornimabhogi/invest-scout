import { CelebrityInvestor } from '@/types/stock';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface CelebrityPanelProps {
  celebrities: CelebrityInvestor[];
}

export const CelebrityPanel = ({ celebrities }: CelebrityPanelProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {celebrities.map((investor) => (
        <Card key={investor.id} className="bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{investor.name}</CardTitle>
            <CardDescription className="text-xs">{investor.firm}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">{investor.description}</p>
            <div className="flex flex-wrap gap-1">
              {investor.holdings.slice(0, 6).map((symbol) => (
                <Badge key={symbol} variant="outline" className="text-xs">
                  {symbol}
                </Badge>
              ))}
              {investor.holdings.length > 6 && (
                <Badge variant="secondary" className="text-xs">
                  +{investor.holdings.length - 6}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
